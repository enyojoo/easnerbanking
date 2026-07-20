#!/usr/bin/env node
/**
 * Yellow Card static-IP relay — deploy on a VM with a fixed public IP.
 *
 * Env:
 *   YC_RELAY_SECRET          required shared secret (match YELLOWCARD_RELAY_SECRET on Vercel)
 *   YC_RELAY_PORT            default 8080
 *   YC_RELAY_BIND            default 127.0.0.1 (put nginx in front for TLS)
 *
 * Usage:
 *   node server.mjs
 */

import { createServer } from "node:http"
import { request as httpsRequest } from "node:https"
import { request as httpRequest } from "node:http"

const ALLOWED_ORIGINS = new Set([
  "https://api.yellowcard.io",
  "https://sandbox.api.yellowcard.io",
])

const secret = String(process.env.YC_RELAY_SECRET || "").trim()
if (!secret) {
  console.error("YC_RELAY_SECRET is required")
  process.exit(1)
}

const port = Number(process.env.YC_RELAY_PORT || 8080)
const bind = String(process.env.YC_RELAY_BIND || "127.0.0.1").trim()

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  })
  res.end(body)
}

function authorize(req) {
  const header = String(req.headers.authorization || "")
  if (header === `Bearer ${secret}`) return true
  const alt = String(req.headers["x-yc-relay-secret"] || "")
  return alt === secret
}

function forwardToYellowcard(payload) {
  const origin = String(payload.origin || "").trim().replace(/\/$/, "")
  const path = String(payload.path || "").trim()
  const method = String(payload.method || "GET").toUpperCase()

  if (!ALLOWED_ORIGINS.has(origin)) {
    return Promise.reject(Object.assign(new Error("origin_not_allowed"), { statusCode: 400 }))
  }
  if (!path.startsWith("/business/") && path !== "/business") {
    return Promise.reject(Object.assign(new Error("path_not_allowed"), { statusCode: 400 }))
  }
  if (!["GET", "POST", "PUT"].includes(method)) {
    return Promise.reject(Object.assign(new Error("method_not_allowed"), { statusCode: 400 }))
  }

  const target = new URL(`${origin}${path}`)
  const headers = { ...(payload.headers || {}) }
  delete headers.host
  delete headers.connection
  delete headers["content-length"]

  const body = payload.body != null ? String(payload.body) : undefined
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest

  return new Promise((resolve, reject) => {
    const req = transport(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          resolve({
            status: res.statusCode || 502,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        })
      },
    )
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { ok: true, service: "yc-relay" })
    }

    if (req.method !== "POST" || req.url !== "/forward") {
      return sendJson(res, 404, { error: "not_found" })
    }

    if (!authorize(req)) {
      return sendJson(res, 401, { error: "unauthorized" })
    }

    const raw = await readBody(req)
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      return sendJson(res, 400, { error: "invalid_json" })
    }

    const upstream = await forwardToYellowcard(payload)
    return sendJson(res, 200, upstream)
  } catch (error) {
    const statusCode = error?.statusCode || 502
    const message = error instanceof Error ? error.message : "relay_failed"
    console.error("[yc-relay]", message)
    return sendJson(res, statusCode, { error: message })
  }
})

server.listen(port, bind, () => {
  console.info(`[yc-relay] listening on http://${bind}:${port}`)
})

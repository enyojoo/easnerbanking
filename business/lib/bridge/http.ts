import {
  getBridgeApiKey,
  getBridgeBaseUrl,
  isBridgeConfigured,
} from "./config"

const BRIDGE_HTTP_TIMEOUT_MS = 20_000

export class BridgeHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
    public readonly method?: string,
    public readonly path?: string,
  ) {
    super(message)
    this.name = "BridgeHttpError"
  }
}

export type BridgeFetchOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  json?: unknown
  headers?: Record<string, string>
  idempotencyKey?: string
  timeoutMs?: number
}

function normalizePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return "/"
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  if (withSlash.startsWith("/v0/")) return withSlash
  return `/v0${withSlash}`
}

export async function bridgeFetch<T>(opts: BridgeFetchOptions): Promise<T> {
  if (!isBridgeConfigured()) {
    throw new Error("Bridge API is not configured")
  }

  const path = normalizePath(opts.path)
  const url = `${getBridgeBaseUrl()}${path}`
  const jsonBody = opts.json != null ? JSON.stringify(opts.json) : undefined
  const headers: Record<string, string> = {
    "Api-Key": getBridgeApiKey(),
    Accept: "application/json",
    ...(jsonBody ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers ?? {}),
  }
  if (opts.idempotencyKey?.trim()) {
    headers["Idempotency-Key"] = opts.idempotencyKey.trim()
  }

  const res = await fetch(url, {
    method: opts.method,
    headers,
    ...(jsonBody ? { body: jsonBody } : {}),
    signal: AbortSignal.timeout(opts.timeoutMs ?? BRIDGE_HTTP_TIMEOUT_MS),
  })

  const text = await res.text()
  let parsed: unknown = text
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (res.status < 200 || res.status >= 300) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "message" in parsed &&
      typeof (parsed as { message?: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : `Bridge ${opts.method} ${path} failed (${res.status})`
    throw new BridgeHttpError(message, res.status, parsed, opts.method, path)
  }

  return parsed as T
}

import { createHash, createHmac } from "crypto"
import {
  getYellowcardApiKey,
  getYellowcardApiOrigin,
  getYellowcardApiSecret,
  getYellowcardEnvironment,
  toYellowcardRequestPath,
  toYellowcardSignedPath,
} from "./config"
import { logYcTiming } from "./timing"

export class YellowcardHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = "YellowcardHttpError"
  }
}

export type YellowcardFetchOptions = {
  method: "GET" | "POST" | "PUT"
  /** Path under `/business`, e.g. `/channels`. */
  path: string
  json?: unknown
}

function bodyHashBase64(body: string): string {
  return createHash("sha256").update(body).digest("base64")
}

export function buildYellowcardAuthHeaders(input: {
  path: string
  method: string
  body?: string
  apiKey?: string
  apiSecret?: string
  timestamp?: string
}): Record<string, string> {
  const apiKey = input.apiKey ?? getYellowcardApiKey()
  const apiSecret = input.apiSecret ?? getYellowcardApiSecret()
  if (!apiKey || !apiSecret) {
    throw new Error("YELLOWCARD_API_KEY and YELLOWCARD_API_SECRET are required")
  }

  const signedPath = toYellowcardSignedPath(input.path)
  const method = input.method.toUpperCase()
  const timestamp = input.timestamp ?? new Date().toISOString()

  const hmac = createHmac("sha256", apiSecret)
  hmac.update(timestamp)
  hmac.update(signedPath)
  hmac.update(method)
  if (input.body) {
    hmac.update(bodyHashBase64(input.body))
  }

  const signature = hmac.digest("base64")
  return {
    "X-YC-Timestamp": timestamp,
    Authorization: `YcHmacV1 ${apiKey}:${signature}`,
  }
}

export async function yellowcardFetch<T>(opts: YellowcardFetchOptions): Promise<T> {
  const requestPath = toYellowcardRequestPath(opts.path)
  const signPath = toYellowcardSignedPath(opts.path)
  const body = opts.json != null ? JSON.stringify(opts.json) : undefined
  const headers: Record<string, string> = {
    ...buildYellowcardAuthHeaders({
      path: signPath,
      method: opts.method,
      body,
    }),
    Accept: "application/json",
    ...(body ? { "Content-Type": "application/json" } : {}),
  }

  const url = `${getYellowcardApiOrigin()}${requestPath}`
  const startedAt = Date.now()
  const res = await fetch(url, {
    method: opts.method,
    headers,
    ...(body ? { body } : {}),
  })

  const text = await res.text()
  logYcTiming("yc_api", {
    method: opts.method,
    path: opts.path,
    status: res.status,
    durationMs: Date.now() - startedAt,
    environment: getYellowcardEnvironment(),
  })
  let parsed: unknown = text
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "message" in parsed &&
      typeof (parsed as { message?: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : `Yellowcard HTTP ${res.status}`
    throw new YellowcardHttpError(message, res.status, parsed)
  }

  return parsed as T
}

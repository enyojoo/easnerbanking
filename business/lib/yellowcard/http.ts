import { createHash, createHmac } from "crypto"
import {
  getYellowcardApiKey,
  getYellowcardApiOrigin,
  getYellowcardApiSecret,
  getYellowcardEnvironment,
  getYellowcardRelaySecret,
  getYellowcardRelayUrl,
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

type YellowcardHttpResponse = {
  status: number
  text: string
  viaRelay: boolean
}

async function requestYellowcardHttp(input: {
  method: YellowcardFetchOptions["method"]
  path: string
  requestPath: string
  headers: Record<string, string>
  body?: string
}): Promise<YellowcardHttpResponse> {
  const relayUrl = getYellowcardRelayUrl()
  if (relayUrl) {
    const relaySecret = getYellowcardRelaySecret()
    if (!relaySecret) {
      throw new Error("YELLOWCARD_RELAY_SECRET is required when YELLOWCARD_RELAY_URL is set")
    }

    const res = await fetch(`${relayUrl}/forward`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${relaySecret}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: input.method,
        path: input.requestPath,
        origin: getYellowcardApiOrigin(),
        headers: input.headers,
        body: input.body ?? null,
      }),
    })

    const relayText = await res.text()
    if (!res.ok) {
      throw new YellowcardHttpError(
        relayText || `Yellowcard relay HTTP ${res.status}`,
        res.status,
        relayText,
      )
    }

    let relayPayload: { status?: number; body?: string; error?: string }
    try {
      relayPayload = JSON.parse(relayText) as { status?: number; body?: string; error?: string }
    } catch {
      throw new YellowcardHttpError("Yellowcard relay returned invalid JSON", 502, relayText)
    }

    if (relayPayload.error) {
      throw new YellowcardHttpError(relayPayload.error, 502, relayPayload)
    }

    return {
      status: Number(relayPayload.status ?? 502),
      text: String(relayPayload.body ?? ""),
      viaRelay: true,
    }
  }

  const url = `${getYellowcardApiOrigin()}${input.requestPath}`
  const res = await fetch(url, {
    method: input.method,
    headers: input.headers,
    ...(input.body ? { body: input.body } : {}),
  })

  return {
    status: res.status,
    text: await res.text(),
    viaRelay: false,
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

  const startedAt = Date.now()
  const { status, text, viaRelay } = await requestYellowcardHttp({
    method: opts.method,
    path: opts.path,
    requestPath,
    headers,
    body,
  })

  logYcTiming("yc_api", {
    method: opts.method,
    path: opts.path,
    status,
    durationMs: Date.now() - startedAt,
    environment: getYellowcardEnvironment(),
    viaRelay,
  })
  let parsed: unknown = text
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (status < 200 || status >= 300) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "message" in parsed &&
      typeof (parsed as { message?: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : `Yellowcard HTTP ${status}`
    throw new YellowcardHttpError(message, status, parsed)
  }

  return parsed as T
}

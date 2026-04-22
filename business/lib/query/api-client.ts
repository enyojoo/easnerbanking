"use client"

import { fetchWithSession } from "@/lib/fetch-with-session"

/**
 * Typed `/api/*` client used by every query/mutation hook.
 *
 * Layers on top of `fetchWithSession` (which handles the short-lived
 * `BUSINESS_APP_SESSION_COOKIE` + silent refresh on 401) with:
 *   - automatic JSON body encoding
 *   - query-string serialization
 *   - structured error objects so `isClientError` / `isAuthError`
 *     in `createBaseQueryClient` can short-circuit retries
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly payload: unknown

  constructor(message: string, status: number, code: string | null, payload: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.payload = payload
  }
}

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number)[]

export interface ApiFetchOptions<TBody = unknown> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: TBody
  query?: Readonly<Record<string, QueryValue>>
  signal?: AbortSignal
  headers?: Record<string, string>
}

let rateLimitCooldownUntilMs = 0

function parseRetryAfterToMs(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000)
  const at = Date.parse(value)
  if (Number.isFinite(at)) {
    const delta = at - Date.now()
    return delta > 0 ? delta : 0
  }
  return null
}

function setRateLimitCooldownFromResponse(res: Response): void {
  const retryAfterMs = parseRetryAfterToMs(res.headers.get("retry-after"))
  const fallbackMs = 30_000
  const cooldownMs = Math.max(retryAfterMs ?? fallbackMs, 1_000)
  rateLimitCooldownUntilMs = Date.now() + cooldownMs
}

function buildUrl(path: string, query: ApiFetchOptions["query"]): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v))
    } else {
      params.set(key, String(value))
    }
  }
  const qs = params.toString()
  if (!qs) return path
  return path.includes("?") ? `${path}&${qs}` : `${path}?${qs}`
}

export async function apiFetch<TResponse = unknown, TBody = unknown>(
  path: string,
  options: ApiFetchOptions<TBody> = {},
): Promise<TResponse> {
  if (Date.now() < rateLimitCooldownUntilMs) {
    const waitMs = rateLimitCooldownUntilMs - Date.now()
    throw new ApiError(
      `Rate limited; retry in ${Math.max(Math.ceil(waitMs / 1000), 1)}s`,
      429,
      "RATE_LIMITED",
      { retryAfterMs: waitMs },
    )
  }

  const { method = "GET", body, query, signal, headers } = options
  const url = buildUrl(path, query)
  const init: RequestInit = {
    method,
    signal,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }

  const res = await fetchWithSession(url, init)
  const text = await res.text()
  const parsed = text ? safeJson(text) : undefined

  if (!res.ok) {
    if (res.status === 429) setRateLimitCooldownFromResponse(res)
    const code = extractCode(parsed)
    const message = extractMessage(parsed) ?? `${method} ${path} failed (${res.status})`
    throw new ApiError(message, res.status, code, parsed)
  }

  return parsed as TResponse
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>
  if (typeof p.message === "string") return p.message
  if (typeof p.error === "string") return p.error
  if (typeof p.error === "object" && p.error && typeof (p.error as { message?: unknown }).message === "string") {
    return (p.error as { message: string }).message
  }
  return null
}

function extractCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>
  if (typeof p.code === "string") return p.code
  if (typeof p.error === "object" && p.error && typeof (p.error as { code?: unknown }).code === "string") {
    return (p.error as { code: string }).code
  }
  return null
}

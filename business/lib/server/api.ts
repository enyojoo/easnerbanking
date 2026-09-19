import "server-only"
import { cookies, headers } from "next/headers"
import { getApiBaseUrl } from "@/lib/api-base-url"
import { BUSINESS_APP_SESSION_COOKIE } from "@/lib/app-session"

/**
 * Server-side `/api/*` client for RSC prefetching.
 *
 * Hits the API origin with the app-session JWT as Bearer (not a host-only
 * Cookie header). After the api split, UI and API are different hosts;
 * `getUserFromApiRequest` accepts this JWT via `getUserFromBearer`.
 *
 * All server fetches are `cache: "no-store"` by default: RSC prefetch
 * runs once per request and we let TanStack Query own the browser
 * freshness model after hydration.
 */

async function resolveBaseUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, "")
  try {
    const h = await headers()
    const host = h.get("x-forwarded-host") ?? h.get("host")
    const proto = h.get("x-forwarded-proto") ?? "https"
    if (host) return `${proto}://${host}`
  } catch {
    // headers() may not be available outside of a request scope.
  }
  return getApiBaseUrl()
}

export interface ServerFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  signal?: AbortSignal
  /** Merged into the outgoing fetch (after JSON Accept / Bearer). */
  headers?: Record<string, string>
}

function buildUrl(path: string, query: ServerFetchOptions["query"]): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  if (!qs) return path
  return path.includes("?") ? `${path}&${qs}` : `${path}?${qs}`
}

export async function serverApiFetch<T>(path: string, options: ServerFetchOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, headers: extraHeaders } = options
  const baseUrl = await resolveBaseUrl()
  const url = `${baseUrl}${buildUrl(path, query)}`
  const store = await cookies()
  const sessionJwt = store.get(BUSINESS_APP_SESSION_COOKIE)?.value

  const res = await fetch(url, {
    method,
    signal,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(sessionJwt ? { Authorization: `Bearer ${sessionJwt}` } : {}),
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    // RSC prefetch errors are non-fatal: client `useQuery` will refetch
    // and show inline errors. Throwing here would crash the layout.
    throw new Error(`serverApiFetch: ${method} ${path} failed with ${res.status}`)
  }
  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

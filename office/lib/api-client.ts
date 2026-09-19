import { resolveApiUrl } from "@easner/shared"
import { supabase } from "./supabase"

const API_URL = resolveApiUrl()

/** Refresh the cached token when it has less than this long left. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000

/**
 * Module-level access-token cache so officeFetch does not await
 * `supabase.auth.getSession()` (an async localStorage read + lock) before
 * every single request. We only hit getSession when the cached token is
 * missing or within 60s of expiry, and fall back to a one-shot refresh +
 * retry if the server rejects the token with a 401.
 */
let cachedAccessToken: { token: string; expiresAtMs: number } | null = null

function cacheSessionToken(session: { access_token?: string; expires_at?: number } | null | undefined) {
  if (session?.access_token) {
    cachedAccessToken = {
      token: session.access_token,
      // `expires_at` is unix seconds; missing means "treat as already stale".
      expiresAtMs: (session.expires_at ?? 0) * 1000,
    }
  } else {
    cachedAccessToken = null
  }
}

async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken && cachedAccessToken.expiresAtMs - Date.now() > TOKEN_EXPIRY_MARGIN_MS) {
    return cachedAccessToken.token
  }
  const { data: { session } } = await supabase.auth.getSession()
  cacheSessionToken(session)
  return cachedAccessToken?.token ?? null
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession()
    if (error) return null
    cacheSessionToken(data.session)
    return cachedAccessToken?.token ?? null
  } catch {
    return null
  }
}

/**
 * Direct-first API calls: routing every request through /api/proxy added a
 * FULL extra serverless invocation (browser → office function → business
 * API) to every admin data fetch. The business app already serves CORS for
 * the office origin (proxy.ts applies it to /api/* with Authorization
 * allowed), so the browser can talk to it directly and halve the latency.
 * If a direct attempt fails at the network/CORS layer, we permanently fall
 * back to the proxy for the session — a missing allowlist entry degrades to
 * the old path instead of breaking.
 */
let directApiBlocked = false

function isNetworkOrCorsFailure(error: unknown): boolean {
  return error instanceof TypeError
}

export async function officeFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const isAbsolute = normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")
  const isApiPath = !isAbsolute && normalizedPath.startsWith("/api/")
  const proxyUrl = `/api/proxy${normalizedPath}`
  const directUrl = `${API_URL}${normalizedPath}`
  const preferDirect = isApiPath && !directApiBlocked

  const resolveUrl = () =>
    isAbsolute ? normalizedPath : isApiPath ? (directApiBlocked ? proxyUrl : directUrl) : directUrl

  const headers = new Headers(options.headers || {})

  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json")
  }

  const doFetch = (token: string | null): Promise<Response> => {
    const url = resolveUrl()
    const isSameOrigin = typeof window !== "undefined" && url.startsWith(window.location.origin)
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    } else {
      headers.delete("Authorization")
    }
    return fetch(url, {
      ...options,
      headers,
      credentials: isSameOrigin ? "include" : "omit",
    })
  }

  const token = await getAccessToken()

  let response: Response
  try {
    response = await doFetch(token)
  } catch (error) {
    if (preferDirect && isNetworkOrCorsFailure(error)) {
      // Direct path unreachable (CORS not allowlisted / network policy):
      // degrade to the proxy for the rest of the session and retry.
      directApiBlocked = true
      response = await doFetch(token)
    } else {
      throw error
    }
  }

  // The cached token can outlive server-side revocation; refresh once and
  // retry once on an authenticated 401.
  if (response.status === 401 && token) {
    const refreshed = await refreshAccessToken()
    if (refreshed && refreshed !== token) {
      return doFetch(refreshed)
    }
  }

  return response
}

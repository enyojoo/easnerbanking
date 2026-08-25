import { supabase } from "./supabase"

const API_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

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

export async function officeFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const isAbsolute = normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")
  const useProxy = !isAbsolute && normalizedPath.startsWith("/api/")
  const url = isAbsolute
    ? normalizedPath
    : useProxy
      ? `/api/proxy${normalizedPath}`
      : `${API_URL}${normalizedPath}`
  const headers = new Headers(options.headers || {})

  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json")
  }

  const isSameOrigin = typeof window !== "undefined" && url.startsWith(window.location.origin)
  const doFetch = (token: string | null): Promise<Response> => {
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
  const response = await doFetch(token)

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

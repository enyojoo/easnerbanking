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

function resolveOfficeApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
    return normalizedPath
  }
  return `${API_URL}${normalizedPath}`
}

/** Office browser calls go to the api origin. No Office-hosted /api handlers. */
export async function officeFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers || {})

  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json")
  }

  const doFetch = (token: string | null): Promise<Response> => {
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    } else {
      headers.delete("Authorization")
    }
    return fetch(resolveOfficeApiUrl(path), {
      ...options,
      headers,
      credentials: "omit",
    })
  }

  const token = await getAccessToken()
  const response = await doFetch(token)

  if (response.status === 401 && token) {
    const refreshed = await refreshAccessToken()
    if (refreshed && refreshed !== token) {
      return doFetch(refreshed)
    }
  }

  return response
}

"use client"

import { resolveApiRequestInput } from "@/lib/api-base-url"
import { isTransientNetworkError } from "@/lib/query/fetch-errors"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithNetworkRetry(doFetch: () => Promise<Response>): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await doFetch()
    } catch (err) {
      lastErr = err
      if (!isTransientNetworkError(err) || attempt >= 2) break
      await sleep(Math.min(250 * 2 ** attempt, 1_500))
    }
  }
  throw lastErr
}

/** Refresh the cached token when it has less than this long left. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000

/**
 * Module-level access-token cache so we do not await `getSession()` (async
 * localStorage) before every call. Refresh only when missing, near expiry,
 * or after a 401. Never mint an app-session cookie per request.
 */
let cachedAccessToken: { token: string; expiresAtMs: number } | null = null

function cacheSessionToken(session: { access_token?: string; expires_at?: number } | null | undefined) {
  if (session?.access_token) {
    cachedAccessToken = {
      token: session.access_token,
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
  const supabase = createSupabaseBrowser()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  cacheSessionToken(session)
  return cachedAccessToken?.token ?? null
}

async function refreshAccessToken(): Promise<string | null> {
  const supabase = createSupabaseBrowser()
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
 * Authenticated API calls for Business / Platform:
 * - Resolve relative `/api/*` paths to `getApiBaseUrl()`.
 * - Send the Supabase access token as `Authorization: Bearer`.
 * - `credentials: "omit"` — no API cookies, no `Domain=.easner.com` session.
 *
 * Routes that rely on **UI-host cookies** (e.g. `easner_business_owner_ip`)
 * must use plain `fetch` against the UI origin, not this helper.
 *
 * On **401**, refresh the session once and retry.
 * On transient network errors, retry a few times before surfacing failure.
 */
export async function fetchWithSession(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const resolvedInput = resolveApiRequestInput(input)
  const headers = new Headers(init.headers)

  const doFetch = (token: string | null): Promise<Response> => {
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    } else {
      headers.delete("Authorization")
    }
    return fetchWithNetworkRetry(() =>
      fetch(resolvedInput, {
        ...init,
        headers,
        credentials: "omit",
      }),
    )
  }

  const token = await getAccessToken()
  let res = await doFetch(token)

  if (res.status !== 401 || !token) {
    return res
  }

  const refreshed = await refreshAccessToken()
  if (!refreshed || refreshed === token) {
    return res
  }

  return doFetch(refreshed)
}

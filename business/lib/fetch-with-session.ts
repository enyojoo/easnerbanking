"use client"

import { ensureBusinessAppSession } from "@/lib/app-session-client"
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

/**
 * Authenticated same-origin `/api/*` calls for the business app:
 * - Mint a **small app session cookie** from the Supabase access token.
 * - Send only that lightweight cookie to `/api/*` requests.
 *
 * Routes that rely on **cookies** (e.g. `easner_business_owner_ip`) must use plain
 * `fetch` with default credentials, not this helper.
 *
 * On **401**, refresh the session once and retry.
 * On transient network errors, retry a few times before surfacing failure.
 */
export async function fetchWithSession(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const supabase = createSupabaseBrowser()
  await ensureBusinessAppSession()

  const doFetch = () => fetchWithNetworkRetry(() => fetch(input, { ...init, credentials: "same-origin" }))

  let res = await doFetch()

  if (res.status !== 401) {
    return res
  }

  const { data: refreshed, error } = await supabase.auth.refreshSession()
  if (error || !refreshed.session) {
    return res
  }

  const ok = await ensureBusinessAppSession(true)
  if (!ok) return res

  return doFetch()
}

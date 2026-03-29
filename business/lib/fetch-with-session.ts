"use client"

import { ensureBusinessAppSession } from "@/lib/app-session-client"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

/**
 * Authenticated same-origin `/api/*` calls for the business app:
 * - Mint a **small app session cookie** from the Supabase access token.
 * - Send only that lightweight cookie to `/api/*` requests.
 *
 * Routes that rely on **cookies** (e.g. `easner_business_owner_ip`) must use plain
 * `fetch` with default credentials, not this helper.
 *
 * On **401**, refresh the session once and retry.
 */
export async function fetchWithSession(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const supabase = createSupabaseBrowser()
  await ensureBusinessAppSession()

  const doFetch = () => fetch(input, { ...init, credentials: "same-origin" })

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

"use client"

import { createSupabaseBrowser } from "@/lib/supabase/browser"

/**
 * Authenticated same-origin `/api/*` calls for the business app:
 * - **`Authorization: Bearer`** from `getSession()` (session in localStorage).
 * - **`credentials: "omit"`** so the browser does **not** send the `Cookie` header.
 *   Legacy `sb-*` Supabase cookies from older deploys can exceed Vercel’s
 *   `REQUEST_HEADER_TOO_LARGE` limit when combined with other headers.
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

  const doFetch = (accessToken: string | undefined) => {
    const headers = new Headers(init.headers)
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`)
    }
    return fetch(input, { ...init, headers, credentials: "omit" })
  }

  const { data } = await supabase.auth.getSession()
  let res = await doFetch(data.session?.access_token)

  if (res.status !== 401) {
    return res
  }

  const { data: refreshed } = await supabase.auth.refreshSession()
  const next = refreshed.session?.access_token
  if (!next) {
    return res
  }

  return doFetch(next)
}

"use client"

import { createSupabaseBrowser } from "@/lib/supabase/browser"

/**
 * Same-origin `/api/*` calls with the Supabase session **cookies** (no `Authorization`
 * header — avoids HTTP 494 on Vercel when Bearer + cookies exceed edge header limits).
 *
 * On **401**, refresh the session once and retry (expired access token, etc.).
 */
export async function fetchWithSession(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const supabase = createSupabaseBrowser()

  const doFetch = () => fetch(input, { ...init, credentials: "include" })

  let res = await doFetch()

  if (res.status !== 401) {
    return res
  }

  const { data: refreshed } = await supabase.auth.refreshSession()
  if (!refreshed.session) {
    return res
  }

  return doFetch()
}

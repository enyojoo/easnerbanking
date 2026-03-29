"use client"

import { createSupabaseBrowser } from "@/lib/supabase/browser"

/**
 * Same-origin `/api/*` calls: attach Supabase JWT (`createClient` uses localStorage, so
 * Route Handlers need `Authorization: Bearer`; `getUserFromApiRequest` falls back to it).
 *
 * - `credentials: "include"` so any Supabase cookies are sent on Vercel/production.
 * - On **401**, refresh the session once and retry (expired access token after tab idle, etc.).
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
    return fetch(input, { ...init, headers, credentials: "include" })
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

"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let browserClient: SupabaseClient | null = null

/**
 * Browser client with **localStorage** session (default `createClient`).
 *
 * Do **not** use `createBrowserClient` here: it persists the session in large
 * `sb-*` cookies; the combined `Cookie` header can exceed Vercel’s
 * `REQUEST_HEADER_TOO_LARGE` limit. Same-origin `/api/*` auth uses
 * `fetchWithSession` (`Authorization: Bearer` + `credentials: "omit"`).
 */
export function createSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  }
  if (!browserClient) {
    browserClient = createClient(url, key)
  }
  return browserClient
}

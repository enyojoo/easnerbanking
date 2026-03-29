"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

let browserClient: SupabaseClient | null = null

/**
 * Browser Supabase client: **cookie-backed** session (`@supabase/ssr` createBrowserClient).
 * Route Handlers read the same cookies via `getUserFromApiRequest` — do **not** add
 * `Authorization: Bearer` on same-origin `/api/*` fetches (Vercel rejects oversized
 * headers with 494; local dev uses a 1MB header limit in package.json scripts).
 */
export function createSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  }
  if (!browserClient) {
    browserClient = createBrowserClient(url, key)
  }
  return browserClient
}

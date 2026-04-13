"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let browserClient: SupabaseClient | null = null
let serverRenderClient: SupabaseClient | null = null

/**
 * Browser client with **localStorage** session (default `createClient`).
 *
 * Do **not** use `createBrowserClient` here: it persists the session in large
 * `sb-*` cookies; the combined `Cookie` header can exceed Vercel’s
 * `REQUEST_HEADER_TOO_LARGE` limit. Same-origin `/api/*` auth uses
 * `fetchWithSession` (`Authorization: Bearer` + `credentials: "omit"`).
 */
export function createSupabaseBrowser() {
  // Client components are rendered once on the server during prerender.
  // Returning a lazy server-side proxy keeps prerendering build-safe while
  // still surfacing misuse if code tries to actually call Supabase on server.
  if (typeof window === "undefined") {
    if (!serverRenderClient) {
      serverRenderClient = new Proxy(
        {},
        {
          get() {
            throw new Error("createSupabaseBrowser() cannot be used during server rendering")
          },
        },
      ) as SupabaseClient
    }
    return serverRenderClient
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  }
  if (!browserClient) {
    browserClient = createClient(url, key, {
      global: {
        fetch: async (input, init) => {
          const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
          const headers = new Headers(init?.headers)
          // Some browser environments/extensions can strip default Supabase headers.
          // Ensure required credentials are always present for REST calls.
          if (requestUrl.startsWith(url)) {
            if (!headers.has("apikey")) headers.set("apikey", key)
            if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${key}`)
          }
          return fetch(input, { ...init, headers })
        },
      },
    })
  }
  return browserClient
}

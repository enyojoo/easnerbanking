"use client"

import { createBaseQueryClient } from "@easner/shared"
import type { QueryClient } from "@tanstack/react-query"

/**
 * Browser-side singleton QueryClient for the Easner Business app.
 *
 * We deliberately create a singleton in the browser (not a new client on
 * every render of Providers) so that:
 *   - client-side navigations keep the cache alive
 *   - the SSR-hydrated snapshot lives in the same instance the UI reads
 *
 * The server-rendered code path creates a per-request client via
 * `createBaseQueryClient()` in each server component that needs to
 * prefetch + dehydrate – never reuses this singleton.
 */

let browserClient: QueryClient | null = null
const BROWSER_QUERY_CACHE_GC_MS = 24 * 60 * 60 * 1000

export function getBrowserQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    // During server render of client components, we must never share
    // caches across requests. The caller is expected to use the server
    // path (`createBaseQueryClient()` in a server component) instead.
    return createBaseQueryClient()
  }
  if (!browserClient) {
    browserClient = createBaseQueryClient({
      defaultOptions: {
        queries: {
          /**
           * Business UX relies on realtime + scoped polling for critical data.
           * Refetching on every focus/reconnect can create noticeable navigation
           * jank (waterfalls) when many screens mount query-heavy components.
           */
          gcTime: BROWSER_QUERY_CACHE_GC_MS,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
      },
    })
  }
  return browserClient
}

export function clearBrowserQueryClient(): void {
  browserClient?.clear()
}

"use client"

import { createBaseQueryClient } from "@easner/shared"
import type { QueryClient } from "@tanstack/react-query"

/**
 * Browser-side singleton QueryClient for Easner Office.
 *
 * Mirrors business: one client per tab so client navigations keep cache alive.
 * Server render of client components gets a fresh per-request client.
 */

let browserClient: QueryClient | null = null
const BROWSER_QUERY_CACHE_GC_MS = 24 * 60 * 60 * 1000

export function getBrowserQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    return createBaseQueryClient()
  }
  if (!browserClient) {
    browserClient = createBaseQueryClient({
      defaultOptions: {
        queries: {
          gcTime: BROWSER_QUERY_CACHE_GC_MS,
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
        },
      },
    })
  }
  return browserClient
}

export function clearBrowserQueryClient(): void {
  browserClient?.clear()
}

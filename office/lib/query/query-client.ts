"use client"

import { createBaseQueryClient } from "@easner/shared"
import type { QueryClient } from "@tanstack/react-query"

let browserClient: QueryClient | null = null

export function getBrowserQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    return createBaseQueryClient()
  }
  if (!browserClient) {
    browserClient = createBaseQueryClient()
  }
  return browserClient
}

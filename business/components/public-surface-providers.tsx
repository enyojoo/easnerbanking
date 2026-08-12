"use client"

import * as React from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "@/components/theme-provider"
import { getBrowserQueryClient } from "@/lib/query/query-client"

/** Minimal client tree for auth, public invoice, and pay flows. */
export function PublicSurfaceProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getBrowserQueryClient()

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  )
}

"use client"

import * as React from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { getBrowserQueryClient } from "@/lib/query/query-client"
import { OfficeRealtimeBridge } from "@/lib/query/attach-office-realtime-bridge"
import { clearPersistedOfficeQueryCache } from "@/lib/query/web-persist"
import { OfficeDataActivity } from "@/components/data/office-data-status"

export function OfficeQueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getBrowserQueryClient()

  React.useEffect(() => {
    // Office contains KYC and financial operations data. Clear caches written
    // by older releases and retain query data in memory for this session only.
    clearPersistedOfficeQueryCache()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <OfficeDataActivity className="fixed bottom-auto left-0 top-[63px] z-[100] lg:left-64" />
      <OfficeRealtimeBridge>
        {children}
      </OfficeRealtimeBridge>
      {process.env.NODE_ENV !== "production" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  )
}

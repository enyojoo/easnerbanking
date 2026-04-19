"use client"

import * as React from "react"
import type { RealtimeHealth } from "@easner/shared"

/**
 * Exposes the current Supabase Realtime health to any component so hooks
 * can opt into the polling fallback (`pollingIntervalFor(band, health)`)
 * without prop-drilling.
 *
 * Providers: mounted in `components/providers.tsx` next to
 * `ScopeRealtimeBridge`. Consumers: query hooks that care about freshness.
 */

export const RealtimeHealthContext = React.createContext<RealtimeHealth>({
  subscribed: false,
  lastEventAt: null,
  lastError: null,
})

export function useRealtimeHealth(): RealtimeHealth {
  return React.useContext(RealtimeHealthContext)
}

export function RealtimeHealthProvider({
  value,
  children,
}: {
  value: RealtimeHealth
  children: React.ReactNode
}) {
  return (
    <RealtimeHealthContext.Provider value={value}>{children}</RealtimeHealthContext.Provider>
  )
}

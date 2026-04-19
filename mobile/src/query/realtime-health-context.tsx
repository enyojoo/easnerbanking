import React from 'react'
import type { RealtimeHealth } from '@easner/shared'

/**
 * Mobile twin of the web RealtimeHealthContext. Mounted inside
 * `QueryProvider`; consumers call `useRealtimeHealth()` and feed it into
 * `pollingIntervalFor(band, health)` on any query that wants a fallback
 * poll only while the Supabase channel is unhealthy.
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

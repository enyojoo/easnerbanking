"use client"

import * as React from "react"
import { pollingIntervalFor, type FreshnessBand, type RealtimeHealth } from "@easner/shared"
import { useOfficeAdminEnabled } from "@/hooks/queries/use-office-admin-enabled"
import { supabase } from "@/lib/supabase"
import { attachOfficeRealtime } from "./attach-office-realtime"
import { getBrowserQueryClient } from "./query-client"
import { useDocumentVisibility } from "./use-document-visibility"

export const OfficeRealtimeHealthContext = React.createContext<RealtimeHealth>({
  subscribed: false,
  lastEventAt: null,
  lastError: null,
})

export function useOfficeRealtimeHealth(): RealtimeHealth {
  return React.useContext(OfficeRealtimeHealthContext)
}

/** Poll only when the tab is visible and the office realtime channel is unhealthy. */
export function useOfficeRealtimeRefetchInterval(band: FreshnessBand): number | false {
  const health = useOfficeRealtimeHealth()
  const tabVisible = useDocumentVisibility()
  return tabVisible ? pollingIntervalFor(band, health) : false
}

function OfficeRealtimeActive({ children }: { children: React.ReactNode }) {
  const qc = getBrowserQueryClient()
  const [health, setHealth] = React.useState<RealtimeHealth>({
    subscribed: false,
    lastEventAt: null,
    lastError: null,
  })

  React.useEffect(() => {
    const detach = attachOfficeRealtime({
      qc,
      supabase: supabase as unknown as import("@easner/shared").SupabaseLikeClient,
      onHealth: setHealth,
    })
    return () => detach()
  }, [qc])

  return (
    <OfficeRealtimeHealthContext.Provider value={health}>{children}</OfficeRealtimeHealthContext.Provider>
  )
}

export function OfficeRealtimeBridge({ children }: { children: React.ReactNode }) {
  const { enabled } = useOfficeAdminEnabled()
  if (!enabled) return <>{children}</>
  return <OfficeRealtimeActive>{children}</OfficeRealtimeActive>
}

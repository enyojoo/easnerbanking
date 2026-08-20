"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { isChannelHealthy, pollingIntervalFor, qk } from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { KybPacket } from "@/lib/grid/kyb-packet-types"
import { useMaybeScope } from "@/lib/query/scope"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"
import { useRealtimeHealth } from "@/lib/query/realtime-health-context"

/** @deprecated Prefer `qk.verification.packet(scope)` — kept for wizard cache writes. */
export const KYB_PACKET_QUERY_KEY = ["grid", "kyb-packet"] as const

export async function fetchKybPacket(): Promise<KybPacket> {
  const res = await fetchWithSession("/api/grid/kyb/packet")
  const json = (await res.json().catch(() => ({}))) as KybPacket & { error?: string }
  if (!res.ok) throw new Error(json.error || "Could not load verification")
  return json
}

function packetNeedsLiveUpdates(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase().trim()
  return s !== "approved"
}

export function useKybPacket(enabled: boolean) {
  const scope = useMaybeScope()
  const realtimeHealth = useRealtimeHealth()
  const tabVisible = useDocumentVisibility()
  const queryKey = scope ? qk.verification.packet(scope) : KYB_PACKET_QUERY_KEY

  return useQuery({
    queryKey,
    queryFn: fetchKybPacket,
    enabled: enabled && Boolean(scope),
    staleTime: 15_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: (query) =>
      packetNeedsLiveUpdates((query.state.data as KybPacket | undefined)?.status),
    refetchInterval: (query) => {
      if (!tabVisible) return false
      if (!packetNeedsLiveUpdates((query.state.data as KybPacket | undefined)?.status)) return false
      if (isChannelHealthy(realtimeHealth)) return 30_000
      return pollingIntervalFor("operational", realtimeHealth)
    },
  })
}

/** Start loading the KYB packet as soon as Settings is open so the CTA can open a filled form. */
export function usePrimeKybPacket(enabled: boolean) {
  const queryClient = useQueryClient()
  const scope = useMaybeScope()
  useEffect(() => {
    if (!enabled || !scope) return
    void queryClient.prefetchQuery({
      queryKey: qk.verification.packet(scope),
      queryFn: fetchKybPacket,
      staleTime: 15_000,
    })
  }, [enabled, queryClient, scope])
}

"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { KybPacket } from "@/lib/grid/kyb-packet-types"

export const KYB_PACKET_QUERY_KEY = ["grid", "kyb-packet"] as const

export async function fetchKybPacket(): Promise<KybPacket> {
  const res = await fetchWithSession("/api/grid/kyb/packet")
  const json = (await res.json().catch(() => ({}))) as KybPacket & { error?: string }
  if (!res.ok) throw new Error(json.error || "Could not load verification")
  return json
}

export function useKybPacket(enabled: boolean) {
  return useQuery({
    queryKey: KYB_PACKET_QUERY_KEY,
    queryFn: fetchKybPacket,
    enabled,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  })
}

/** Start loading the KYB packet as soon as Settings is open so the CTA can open a filled form. */
export function usePrimeKybPacket(enabled: boolean) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    void queryClient.prefetchQuery({
      queryKey: KYB_PACKET_QUERY_KEY,
      queryFn: fetchKybPacket,
      staleTime: 60_000,
    })
  }, [enabled, queryClient])
}

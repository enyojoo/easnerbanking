"use client"

import { fetchWithSession } from "@/lib/fetch-with-session"
import { useQuery } from "@tanstack/react-query"
import { emptySendAllowance, type ResolvedSendAllowance } from "@easner/shared"

export type WalletSendComplianceResponse = {
  stablecoin: ResolvedSendAllowance
  fiatPayout: ResolvedSendAllowance
  velocityEnforced: boolean
}

async function fetchWalletSendCompliance(businessScope: boolean): Promise<WalletSendComplianceResponse> {
  const res = await fetchWithSession("/api/account/send-compliance", {
    headers: businessScope ? { "X-Easner-Account-Scope": "business" } : undefined,
  })
  if (!res.ok) {
    return {
      stablecoin: emptySendAllowance(),
      fiatPayout: emptySendAllowance(),
      velocityEnforced: false,
    }
  }
  return (await res.json()) as WalletSendComplianceResponse
}

export function useWalletSendCompliance(enabled = true) {
  return useQuery({
    queryKey: ["wallet-send-compliance", enabled ? "business" : "none"],
    queryFn: () => fetchWalletSendCompliance(enabled),
    staleTime: 30_000,
    enabled,
  })
}

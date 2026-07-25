"use client"

import { useQuery } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import { OFFICE_OPERATIONAL_GC_MS } from "./constants"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export async function fetchOfficeUserMfa(userId: string): Promise<{ hasTotp: boolean }> {
  const r = await officeFetch(`/api/admin/office/users/${encodeURIComponent(userId)}/mfa`)
  const d = (await r.json().catch(() => ({}))) as { hasTotp?: boolean; error?: string }
  if (!r.ok) {
    throw new Error(typeof d.error === "string" ? d.error : "Failed to load MFA status")
  }
  return { hasTotp: Boolean(d.hasTotp) }
}

export function useOfficeUserMfa(userId: string | null | undefined) {
  const { enabled: adminEnabled } = useOfficeAdminEnabled()
  const enabled = adminEnabled && Boolean(userId)

  return useQuery({
    queryKey: officeKeys.userMfa(userId ?? ""),
    enabled,
    staleTime: 60_000,
    gcTime: OFFICE_OPERATIONAL_GC_MS,
    refetchOnWindowFocus: false,
    retry: 1,
    refetchOnReconnect: true,
    queryFn: () => fetchOfficeUserMfa(String(userId)),
  })
}

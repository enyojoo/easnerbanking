"use client"

import { useQuery } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import type { CommunicationPreferences } from "@easner/shared"
import { officeOperationalQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export type OfficeUserRow = {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  date_of_birth: string | null
  avatar_url: string | null
  role: string
  easner_business_id: string | null
  created_at: string
  updated_at: string
  noah_customer_id?: string | null
  noah_kyc_status?: string | null
  noah_kyc_rejection_reasons?: unknown
  kyc_id_type?: string | null
  kyc_verified_at?: string | null
  noah_usd_virtual_account_id?: string | null
  noah_eur_virtual_account_id?: string | null
  noah_gbp_virtual_account_id?: string | null
  noah_kyb_customer_id?: string | null
  grid_customer_id?: string | null
  verification_status?: string | null
  linkedBusinessName?: string | null
  enabled_extra_account_currencies?: string[]
  email_confirmed_at?: string | null
  communicationPreferences?: CommunicationPreferences
  hasExpoPushToken?: boolean
  totalTransactions: number
  totalVolume: number
  verificationStatus?: string
  noahKycStatus?: string
}

export function useOfficeUsersDirectory() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.users(),
    enabled,
    ...officeOperationalQueryDefaults,
    queryFn: async (): Promise<OfficeUserRow[]> => {
      const r = await officeFetch("/api/admin/office/users")
      const d = (await r.json()) as { users?: unknown[]; error?: string }
      if (!r.ok || d.error) {
        throw new Error(typeof d.error === "string" ? d.error : "Failed to load users")
      }
      const rows = d.users ?? []
      return (rows as Record<string, unknown>[]).map((row) => {
        const id = String(row.id)
        const noahKycStatus = String(row.noah_kyc_status || "not_started")
        return {
          ...row,
          id,
          email: (row.email as string | null) ?? null,
          full_name: (row.full_name as string | null) ?? null,
          phone: (row.phone as string | null) ?? null,
          date_of_birth: (row.date_of_birth as string | null) ?? null,
          avatar_url: (row.avatar_url as string | null) ?? null,
          role: String(row.role || "individual"),
          easner_business_id: (row.easner_business_id as string | null) ?? null,
          created_at: String(row.created_at),
          updated_at: String(row.updated_at),
          noah_customer_id: row.noah_customer_id as string | null | undefined,
          noah_kyc_status: row.noah_kyc_status as string | null | undefined,
          noah_kyc_rejection_reasons: row.noah_kyc_rejection_reasons,
          kyc_id_type: row.kyc_id_type as string | null | undefined,
          kyc_verified_at: row.kyc_verified_at as string | null | undefined,
          noah_usd_virtual_account_id: row.noah_usd_virtual_account_id as string | null | undefined,
          noah_eur_virtual_account_id: row.noah_eur_virtual_account_id as string | null | undefined,
          noah_gbp_virtual_account_id: row.noah_gbp_virtual_account_id as string | null | undefined,
          noah_kyb_customer_id: row.noah_kyb_customer_id as string | null | undefined,
          grid_customer_id: row.grid_customer_id as string | null | undefined,
          verification_status: row.verification_status as string | null | undefined,
          linkedBusinessName: (row.linkedBusinessName as string | null | undefined) ?? null,
          enabled_extra_account_currencies: row.enabled_extra_account_currencies as string[] | undefined,
          email_confirmed_at: row.email_confirmed_at as string | null | undefined,
          communicationPreferences: row.communicationPreferences as CommunicationPreferences | undefined,
          hasExpoPushToken: Boolean(row.hasExpoPushToken),
          totalTransactions: 0,
          totalVolume: 0,
          verificationStatus: noahKycStatus === "approved" ? "verified" : "pending",
          noahKycStatus,
        } as OfficeUserRow
      })
    },
  })
}

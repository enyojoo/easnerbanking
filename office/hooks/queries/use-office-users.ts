"use client"

import { useQuery } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import type { CommunicationPreferences } from "@easner/shared"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
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
  verification_provider?: string | null
  bridge_customer_id?: string | null
  bridge_kyc_status?: string | null
  bridge_kyc_rejection_reasons?: unknown
  verification_rejection_reasons?: unknown
  linkedBusinessName?: string | null
  enabled_extra_account_currencies?: string[]
  email_confirmed_at?: string | null
  communicationPreferences?: CommunicationPreferences
  hasExpoPushToken?: boolean
  easetag?: string | null
  kyc_id_number?: string | null
  kyc_id_issuing_country?: string | null
  kyc_address_street?: string | null
  kyc_address_city?: string | null
  kyc_address_state?: string | null
  kyc_address_post_code?: string | null
  kyc_address_country?: string | null
  residence_country?: string | null
  bridge_cutover_required_at?: string | null
  bridge_cutover_deadline_at?: string | null
  stripe_crypto_customer_id?: string | null
  stripe_express_deposits_status?: string | null
  stripe_express_kyc_tier?: string | null
  totalTransactions: number
  totalVolume: number
  verificationStatus?: string
  noahKycStatus?: string
  accountRestrictionPhase?: "wind_down" | "locked" | null
  accountRestrictionWindDownEndsAt?: string | null
  accountRestrictionSource?: "grid" | "noah" | "office" | null
  velocityLimitActive?: boolean
  velocityExpiresAt?: string | null
  velocityMaxSendUsd?: number | null
  velocitySentUsd?: number | null
  velocityTriggerReason?: string | null
  velocityMode?: string | null
}

/**
 * Whole-directory query. The backing route is GET /api/admin/office/users
 * on the api app and does not paginate yet; once it grows `limit`/`cursor`
 * + `nextCursor`, convert this to useInfiniteQuery and flatten pages. Until
 * then the users page keeps the DOM small with a client-side render cap
 * ("Load more").
 * The ~35-field row normalization below runs inside the queryFn, so it
 * executes once per fetch – not per render.
 *
 * `fetchOfficeUsersDirectory` is the single source of truth for that
 * normalization; the hook and the boot-time primer both consume it via
 * `officeUsersQueryOptions`.
 */
export async function fetchOfficeUsersDirectory(): Promise<OfficeUserRow[]> {
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
      verification_provider: row.verification_provider as string | null | undefined,
      bridge_customer_id: row.bridge_customer_id as string | null | undefined,
      bridge_kyc_status: row.bridge_kyc_status as string | null | undefined,
      linkedBusinessName: (row.linkedBusinessName as string | null | undefined) ?? null,
      enabled_extra_account_currencies: row.enabled_extra_account_currencies as string[] | undefined,
      email_confirmed_at: row.email_confirmed_at as string | null | undefined,
      communicationPreferences: row.communicationPreferences as CommunicationPreferences | undefined,
      hasExpoPushToken: Boolean(row.hasExpoPushToken),
      totalTransactions: 0,
      totalVolume: 0,
      verificationStatus: noahKycStatus === "approved" ? "verified" : "pending",
      noahKycStatus,
      accountRestrictionPhase:
        (row.accountRestrictionPhase as OfficeUserRow["accountRestrictionPhase"]) ?? null,
      accountRestrictionWindDownEndsAt:
        (row.accountRestrictionWindDownEndsAt as string | null | undefined) ?? null,
      accountRestrictionSource:
        (row.accountRestrictionSource as OfficeUserRow["accountRestrictionSource"]) ?? null,
      velocityLimitActive: Boolean(row.velocityLimitActive),
      velocityExpiresAt: (row.velocityExpiresAt as string | null | undefined) ?? null,
      velocityMaxSendUsd:
        typeof row.velocityMaxSendUsd === "number" ? row.velocityMaxSendUsd : null,
      velocitySentUsd: typeof row.velocitySentUsd === "number" ? row.velocitySentUsd : null,
      velocityTriggerReason: (row.velocityTriggerReason as string | null | undefined) ?? null,
      velocityMode: (row.velocityMode as string | null | undefined) ?? null,
    } as OfficeUserRow
  })
}

/** Options consumed by both `useOfficeUsersDirectory` and `primeOfficeNav`. */
export function officeUsersQueryOptions() {
  return {
    queryKey: officeKeys.users(),
    queryFn: fetchOfficeUsersDirectory,
    ...officeOperationalQueryDefaults,
  }
}

export function useOfficeUsersDirectory() {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("operational")

  return useQuery({
    ...officeUsersQueryOptions(),
    enabled,
    refetchInterval,
  })
}

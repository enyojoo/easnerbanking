import type { SupabaseClient } from "@supabase/supabase-js"
import type { VerificationProvider, VerificationStatus, VerificationSubjectKind } from "./types"
import { mapGridPartnerStatus, mapNoahPartnerStatus } from "./map-partner-status"

export type StoredVerificationRow = {
  verification_provider: VerificationProvider | null
  verification_status: VerificationStatus | string | null
  verification_rejection_reasons: unknown
  verified_at?: string | null
  grid_customer_id?: string | null
  noah_kyc_status?: string | null
  noah_kyb_status?: string | null
}

export async function readVerificationRow(
  admin: SupabaseClient,
  input: { kind: VerificationSubjectKind; businessId?: string | null; userId: string },
): Promise<StoredVerificationRow | null> {
  if (input.kind === "business") {
    if (!input.businessId) return null
    const { data, error } = await admin
      .from("businesses")
      .select(
        "verification_provider,verification_status,verification_rejection_reasons,kyb_verified_at,grid_customer_id,noah_kyb_status",
      )
      .eq("id", input.businessId)
      .maybeSingle()
    if (error || !data) return null
    const row = data as Record<string, unknown>
    return {
      ...(row as StoredVerificationRow),
      verified_at: (row.kyb_verified_at as string | null | undefined) ?? null,
    }
  }

  const { data, error } = await admin
    .from("users")
    .select(
      "verification_provider,verification_status,verification_rejection_reasons,kyc_verified_at,grid_customer_id,noah_kyc_status",
    )
    .eq("id", input.userId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as Record<string, unknown>
  return {
    ...(row as StoredVerificationRow),
    verified_at: (row.kyc_verified_at as string | null | undefined) ?? null,
  }
}

function isProgressedVerificationStatus(status: string): status is VerificationStatus {
  return (
    status === "approved" ||
    status === "pending" ||
    status === "rejected" ||
    status === "hold"
  )
}

/**
 * Canonical KYC/KYB for money-movement gates.
 *
 * Grid SoR trusts `verification_status` only (cutover may leave Noah mirrors approved).
 * Noah / unset SoR: prefer progressed canonical values; treat `not_started`/empty as
 * stale and fall back to Noah mirrors so post-cutover webhook lag cannot block payouts.
 */
export function canonicalVerificationStatus(row: StoredVerificationRow | null): VerificationStatus {
  if (!row) return "not_started"
  const provider = String(row.verification_provider ?? "").toLowerCase()
  const direct = String(row.verification_status ?? "").toLowerCase()

  if (provider === "grid") {
    if (isProgressedVerificationStatus(direct) || direct === "not_started") {
      return direct as VerificationStatus
    }
    return mapGridPartnerStatus(row.noah_kyb_status ?? row.noah_kyc_status)
  }

  if (isProgressedVerificationStatus(direct)) {
    return direct
  }
  return mapNoahPartnerStatus(row.noah_kyb_status ?? row.noah_kyc_status)
}

export async function persistVerificationStatus(
  admin: SupabaseClient,
  input: {
    kind: VerificationSubjectKind
    businessId?: string | null
    userId: string
    provider: VerificationProvider
    status: VerificationStatus
    rejectionReasons?: unknown
    verifiedAt?: string | null
    gridCustomerId?: string | null
  },
): Promise<void> {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    verification_provider: input.provider,
    verification_status: input.status,
    verification_rejection_reasons: input.rejectionReasons ?? null,
    updated_at: now,
  }
  if (input.status === "approved") {
    if (input.kind === "business") {
      patch.kyb_verified_at = input.verifiedAt ?? now
    } else {
      patch.kyc_verified_at = input.verifiedAt ?? now
    }
  } else if (input.kind === "business") {
    patch.kyb_verified_at = null
  }
  if (input.gridCustomerId) {
    patch.grid_customer_id = input.gridCustomerId
  }

  if (input.kind === "business" && input.businessId) {
    const { error } = await admin.from("businesses").update(patch).eq("id", input.businessId)
    if (error) throw new Error(`persistVerificationStatus(business): ${error.message}`)
    return
  }
  const { error } = await admin.from("users").update(patch).eq("id", input.userId)
  if (error) throw new Error(`persistVerificationStatus(user): ${error.message}`)
}

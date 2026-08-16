import type { SupabaseClient } from "@supabase/supabase-js"
import type { VerificationProvider, VerificationStatus, VerificationSubjectKind } from "./types"
import { mapNoahPartnerStatus } from "./map-partner-status"

export type StoredVerificationRow = {
  verification_provider: VerificationProvider | null
  verification_status: VerificationStatus | string | null
  verification_rejection_reasons: unknown
  verified_at?: string | null
  grid_customer_id?: string | null
  noah_kyc_status?: string | null
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
        "verification_provider,verification_status,verification_rejection_reasons,kyb_verified_at,grid_customer_id",
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
    status === "in_progress" ||
    status === "pending" ||
    status === "rejected" ||
    status === "hold"
  )
}

/**
 * Canonical KYC/KYB for money-movement gates.
 *
 * Business Grid KYB: `verification_status` only — Noah mirror columns are not read.
 * Consumer Noah KYC: prefer progressed canonical values; fall back to Noah mirrors when stale.
 */
export function canonicalVerificationStatus(row: StoredVerificationRow | null): VerificationStatus {
  if (!row) return "not_started"
  const provider = String(row.verification_provider ?? "").toLowerCase()
  const direct = String(row.verification_status ?? "").toLowerCase()

  if (provider === "grid") {
    return isProgressedVerificationStatus(direct) ? direct : "not_started"
  }

  if (isProgressedVerificationStatus(direct)) {
    return direct
  }
  return mapNoahPartnerStatus(row.noah_kyc_status)
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

/** Clear a stale Grid customer and return the org to Begin verification. */
export async function resetBusinessKybToNotStarted(
  admin: SupabaseClient,
  businessId: string,
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await admin
    .from("businesses")
    .update({
      grid_customer_id: null,
      verification_status: "not_started",
      verification_rejection_reasons: null,
      kyb_verified_at: null,
      updated_at: now,
    })
    .eq("id", businessId)
  if (error) throw new Error(`resetBusinessKybToNotStarted: ${error.message}`)
}

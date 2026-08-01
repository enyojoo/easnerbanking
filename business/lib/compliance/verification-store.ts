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
        "verification_provider,verification_status,verification_rejection_reasons,verified_at,grid_customer_id,noah_kyb_status",
      )
      .eq("id", input.businessId)
      .maybeSingle()
    if (error || !data) return null
    return data as StoredVerificationRow
  }

  const { data, error } = await admin
    .from("users")
    .select(
      "verification_provider,verification_status,verification_rejection_reasons,verified_at,grid_customer_id,noah_kyc_status",
    )
    .eq("id", input.userId)
    .maybeSingle()
  if (error || !data) return null
  return data as StoredVerificationRow
}

export function canonicalVerificationStatus(row: StoredVerificationRow | null): VerificationStatus {
  if (!row) return "not_started"
  const direct = String(row.verification_status ?? "").toLowerCase()
  if (
    direct === "approved" ||
    direct === "pending" ||
    direct === "rejected" ||
    direct === "hold" ||
    direct === "not_started"
  ) {
    return direct as VerificationStatus
  }

  const provider = String(row.verification_provider ?? "").toLowerCase()
  if (provider === "grid") {
    return mapGridPartnerStatus(row.noah_kyb_status ?? row.noah_kyc_status)
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
    patch.verified_at = input.verifiedAt ?? now
  }
  if (input.gridCustomerId) {
    patch.grid_customer_id = input.gridCustomerId
  }

  if (input.kind === "business" && input.businessId) {
    await admin.from("businesses").update(patch).eq("id", input.businessId)
    return
  }
  await admin.from("users").update(patch).eq("id", input.userId)
}

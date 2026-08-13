import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  mapGridPartnerStatus,
  persistVerificationStatus,
  type VerificationStatus,
} from "@/lib/compliance"
import { parseGridEndUserTermsFromGridCustomer } from "./end-user-terms-consent"
import {
  parseGridBeneficialOwnerForOwnerUsers,
  pickGridBeneficialOwner,
} from "./parse-grid-beneficial-owner-for-users"

const OWNER_USER_COLUMNS =
  "id,email,full_name,noah_kyc_status,verification_status,grid_end_user_terms_version,grid_end_user_terms_accepted_at"

function ownerIndividualApproved(row: {
  verification_status?: string | null
  noah_kyc_status?: string | null
} | null): boolean {
  return (
    String(row?.verification_status ?? "").toLowerCase() === "approved" ||
    String(row?.noah_kyc_status ?? "").toLowerCase() === "approved"
  )
}

function beneficialOwnerKycStatus(owner: Record<string, unknown> | null): VerificationStatus | null {
  if (!owner) return null
  const raw = String(owner.kycStatus ?? owner.kyc_status ?? "").trim()
  if (!raw) return null
  const status = mapGridPartnerStatus(raw)
  return status === "not_started" ? null : status
}

export type SyncGridBusinessOwnerUserResult = {
  ownerUserId: string
  beneficialOwnerId: string | null
  ownerVerificationStatus: VerificationStatus | null
}

/** Sync org owner `users` row from Grid BUSINESS customer (UBO + end-user terms). */
export async function syncGridBusinessOwnerUserFromKyb(input: {
  admin: SupabaseClient
  businessId: string
  fallbackUserId: string
  customer: Record<string, unknown>
  occurredAt?: string
}): Promise<SyncGridBusinessOwnerUserResult> {
  const ownerUserId = await resolveOrgOwnerUserId(
    input.admin,
    input.businessId,
    input.fallbackUserId,
  )

  const { data: ownerRow } = await input.admin
    .from("users")
    .select(OWNER_USER_COLUMNS)
    .eq("id", ownerUserId)
    .maybeSingle()

  const beneficialOwner = pickGridBeneficialOwner(input.customer, {
    ownerEmail: (ownerRow?.email as string | null) ?? null,
    ownerFullName: (ownerRow?.full_name as string | null) ?? null,
  })
  const beneficialOwnerId = beneficialOwner
    ? String(beneficialOwner.id ?? "").trim() || null
    : null

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    ...parseGridEndUserTermsFromGridCustomer(input.customer),
  }

  if (beneficialOwnerId) {
    patch.grid_beneficial_owner_id = beneficialOwnerId
  }

  if (!ownerIndividualApproved(ownerRow as { verification_status?: string | null; noah_kyc_status?: string | null })) {
    Object.assign(
      patch,
      parseGridBeneficialOwnerForOwnerUsers(input.customer, {
        ownerEmail: (ownerRow?.email as string | null) ?? null,
        ownerFullName: (ownerRow?.full_name as string | null) ?? null,
      }),
    )
  }

  const keys = Object.keys(patch).filter((k) => patch[k] != null && patch[k] !== "")
  if (keys.length > 0) {
    await input.admin
      .from("users")
      .update({ ...patch, updated_at: now })
      .eq("id", ownerUserId)
  }

  const ownerVerificationStatus = beneficialOwnerKycStatus(beneficialOwner)
  if (ownerVerificationStatus && !ownerIndividualApproved(ownerRow as { verification_status?: string | null; noah_kyc_status?: string | null })) {
    await persistVerificationStatus(input.admin, {
      kind: "individual",
      userId: ownerUserId,
      provider: "grid",
      status: ownerVerificationStatus,
      verifiedAt:
        ownerVerificationStatus === "approved"
          ? input.occurredAt ?? now
          : null,
    })
  }

  return { ownerUserId, beneficialOwnerId, ownerVerificationStatus }
}

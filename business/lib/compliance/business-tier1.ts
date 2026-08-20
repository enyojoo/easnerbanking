import { isVerificationApproved } from "./map-partner-status"
import type { VerificationStatus } from "./types"

export type BusinessVerificationFields = {
  verification_status?: string | null
  verification_provider?: string | null
  verification_rejection_reasons?: unknown
  grid_customer_id?: string | null
}

function usesGridVerification(row: BusinessVerificationFields | null | undefined): boolean {
  return String(row?.verification_provider ?? "").toLowerCase() === "grid"
}

/** True when org KYB/compliance SoR is Grid (skip Noah KYB/VA fallback paths). */
export function businessUsesGridVerification(
  row: BusinessVerificationFields | null | undefined,
): boolean {
  return usesGridVerification(row)
}

/** Effective Tier 1 status – reads canonical `verification_status`. */
export function businessTier1Status(row: BusinessVerificationFields | null | undefined): string | null {
  if (!row) return null
  const status = String(row.verification_status ?? "not_started").trim()
  return status || "not_started"
}

/** Product Tier 1 complete for a business row (canonical verification_status). */
export function isBusinessTier1Complete(row: BusinessVerificationFields | null | undefined): boolean {
  const status = businessTier1Status(row)
  if (!status) return false
  return isVerificationApproved(status.toLowerCase() as VerificationStatus)
}

export function businessTier1RejectionReasons(
  row: BusinessVerificationFields | null | undefined,
): unknown[] | null {
  if (!row) return null
  const reasons = row.verification_rejection_reasons
  return Array.isArray(reasons) ? reasons : null
}

/** Grid customer id for hosted KYB. */
export function businessHostedKybCustomerId(
  row: BusinessVerificationFields | null | undefined,
): string | null {
  if (!row) return null
  const gridId = String(row.grid_customer_id ?? "").trim()
  return gridId || null
}

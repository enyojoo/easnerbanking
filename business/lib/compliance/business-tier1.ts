import { isVerificationApproved } from "./map-partner-status"
import type { VerificationStatus } from "./types"

export type BusinessVerificationFields = {
  verification_status?: string | null
  verification_provider?: string | null
  verification_rejection_reasons?: unknown
  noah_kyb_status?: string | null
  noah_kyb_rejection_reasons?: unknown
  grid_customer_id?: string | null
  noah_customer_id?: string | null
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

/** Effective Tier 1 status for product surfaces (Grid SoR ignores legacy Noah mirrors after cutover). */
export function businessTier1Status(row: BusinessVerificationFields | null | undefined): string | null {
  if (!row) return null
  if (usesGridVerification(row)) {
    const status = String(row.verification_status ?? "not_started").trim()
    return status || "not_started"
  }
  const direct = String(row.verification_status ?? "")
    .trim()
    .toLowerCase()
  if (
    direct === "approved" ||
    direct === "pending" ||
    direct === "rejected" ||
    direct === "hold"
  ) {
    return direct
  }
  // Treat not_started/empty as stale vs live Noah KYB mirrors.
  const noah = String(row.noah_kyb_status ?? "").trim()
  return noah || direct || null
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
  if (usesGridVerification(row)) {
    const reasons = row.verification_rejection_reasons
    return Array.isArray(reasons) ? reasons : null
  }
  const reasons = row.verification_rejection_reasons ?? row.noah_kyb_rejection_reasons
  return Array.isArray(reasons) ? reasons : null
}

/** Grid customer id for hosted KYB; on Grid SoR ignore legacy Noah customer id. */
export function businessHostedKybCustomerId(
  row: BusinessVerificationFields | null | undefined,
): string | null {
  if (!row) return null
  const gridId = String(row.grid_customer_id ?? "").trim()
  if (usesGridVerification(row)) return gridId || null
  const noahId = String(row.noah_customer_id ?? "").trim()
  return gridId || noahId || null
}

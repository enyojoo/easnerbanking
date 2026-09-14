import { isVerificationApproved } from "./map-partner-status"
import type { VerificationStatus } from "./types"

export type BusinessVerificationFields = {
  verification_status?: string | null
  verification_provider?: string | null
  verification_rejection_reasons?: unknown
  grid_customer_id?: string | null
  bridge_kyc_status?: string | null
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

/** US banking (Grid) status only – never mix with Bridge/Euro. */
export function businessTier1Status(row: BusinessVerificationFields | null | undefined): string | null {
  if (!row) return null
  const status = String(row.verification_status ?? "not_started").trim()
  return status || "not_started"
}

/** True when US banking KYB is approved (Grid `verification_status` only). */
export function isBusinessGridKybApproved(row: BusinessVerificationFields | null | undefined): boolean {
  const status = businessTier1Status(row)
  if (!status) return false
  return isVerificationApproved(status.toLowerCase() as VerificationStatus)
}

/** True when Euro banking KYB is approved (`bridge_kyc_status` only). */
export function isBusinessBridgeKybApproved(row: BusinessVerificationFields | null | undefined): boolean {
  return isVerificationApproved(String(row?.bridge_kyc_status ?? "").toLowerCase() as VerificationStatus)
}

/**
 * Org KYB complete: Grid approved OR Bridge approved.
 * Columns stay independent so finishing one rail does not overwrite the other.
 */
export function isBusinessTier1Complete(row: BusinessVerificationFields | null | undefined): boolean {
  return isBusinessGridKybApproved(row) || isBusinessBridgeKybApproved(row)
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

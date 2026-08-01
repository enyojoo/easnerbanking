import { isVerificationApproved } from "./map-partner-status"
import type { VerificationStatus } from "./types"

export type BusinessVerificationFields = {
  verification_status?: string | null
  verification_provider?: string | null
  noah_kyb_status?: string | null
}

/** Product Tier 1 complete for a business row (canonical verification_status). */
export function isBusinessTier1Complete(row: BusinessVerificationFields | null | undefined): boolean {
  if (!row) return false
  const status = String(row.verification_status ?? row.noah_kyb_status ?? "").toLowerCase()
  return isVerificationApproved(status as VerificationStatus)
}

export function businessTier1Status(row: BusinessVerificationFields | null | undefined): string | null {
  if (!row) return null
  const status = String(row.verification_status ?? row.noah_kyb_status ?? "").trim()
  return status || null
}

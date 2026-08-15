import type { VerificationStatus } from "@/lib/compliance/types"
import { mapGridPartnerStatus } from "@/lib/compliance/map-partner-status"

export type GridVerificationSummary = {
  verificationStatus?: string | null
}

function normStatus(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase()
}

function readBeneficialOwners(customer: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(customer.beneficialOwners)
    ? (customer.beneficialOwners as Record<string, unknown>[])
    : []
}

function verificationSignalsInReview(verifications: GridVerificationSummary[]): boolean {
  return verifications.some((v) => {
    const s = normStatus(v.verificationStatus)
    return s === "PENDING_MANUAL_REVIEW" || s === "IN_PROGRESS"
  })
}

function verificationsAreEmptyOrResolveErrors(verifications: GridVerificationSummary[]): boolean {
  if (verifications.length === 0) return true
  return verifications.every((v) => normStatus(v.verificationStatus) === "RESOLVE_ERRORS")
}

function allBeneficialOwnersApproved(beneficialOwners: Record<string, unknown>[]): boolean {
  if (beneficialOwners.length === 0) return false
  return beneficialOwners.every((bo) => normStatus(String(bo.kycStatus ?? "")) === "APPROVED")
}

/**
 * Map Grid BUSINESS customer + optional verifications to canonical KYB status.
 * Hosted Sumsub `PENDING` often means mid-flow — distinguish from true in-review.
 */
export function resolveGridBusinessKybLocalStatus(input: {
  customer: Record<string, unknown>
  verifications?: GridVerificationSummary[]
}): VerificationStatus {
  const raw = normStatus(String(input.customer.kybStatus ?? input.customer.kycStatus ?? ""))
  if (raw !== "PENDING") {
    return mapGridPartnerStatus(raw)
  }

  const verifications = input.verifications ?? []
  if (verificationSignalsInReview(verifications)) {
    return "pending"
  }

  const beneficialOwners = readBeneficialOwners(input.customer)
  if (allBeneficialOwnersApproved(beneficialOwners)) {
    return "pending"
  }

  if (verificationsAreEmptyOrResolveErrors(verifications)) {
    return "in_progress"
  }

  return "in_progress"
}

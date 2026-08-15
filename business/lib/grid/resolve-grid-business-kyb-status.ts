import type { VerificationStatus } from "@/lib/compliance/types"
import { mapGridPartnerStatus } from "@/lib/compliance/map-partner-status"

export type GridVerificationSummary = {
  verificationStatus?: string | null
  errors?: Array<{ type?: string | null }> | null
}

function normStatus(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase()
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
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

function resolveErrorsLookLikeHostedSubmittedPath(verifications: GridVerificationSummary[]): boolean {
  const resolveErrorVerifications = verifications.filter(
    (v) => normStatus(v.verificationStatus) === "RESOLVE_ERRORS",
  )
  if (resolveErrorVerifications.length === 0) return false

  return resolveErrorVerifications.every((v) => {
    const errors = Array.isArray(v.errors) ? v.errors : []
    if (errors.length === 0) return false
    return errors.every((error) => {
      const type = normStatus(String(error.type ?? ""))
      return type === "MISSING_FIELD" || type.startsWith("MISSING_")
    })
  })
}

function hostedKybLooksSubmitted(customer: Record<string, unknown>): boolean {
  const businessInfo = readRecord(customer.businessInfo)
  const hasBusinessCore =
    hasNonEmptyString(businessInfo.legalName ?? businessInfo.tradeName ?? customer.name) &&
    hasNonEmptyString(businessInfo.taxId ?? businessInfo.registrationNumber) &&
    hasNonEmptyString(businessInfo.country ?? businessInfo.incorporationCountry)

  const beneficialOwners = readBeneficialOwners(customer)
  if (!hasBusinessCore || beneficialOwners.length === 0) return false

  return beneficialOwners.some((bo) => {
    const kycStatus = normStatus(String(bo.kycStatus ?? ""))
    if (kycStatus !== "PENDING" && kycStatus !== "APPROVED") return false

    const personalInfo = readRecord(bo.personalInfo)
    const address = readRecord(personalInfo.address)
    return (
      hasNonEmptyString(personalInfo.firstName) &&
      hasNonEmptyString(personalInfo.lastName) &&
      hasNonEmptyString(personalInfo.birthDate) &&
      hasNonEmptyString(personalInfo.identifier) &&
      hasNonEmptyString(personalInfo.email) &&
      hasNonEmptyString(address.country)
    )
  })
}

function hostedKybLooksSubmittedAndAwaitingReview(
  customer: Record<string, unknown>,
  verifications: GridVerificationSummary[],
): boolean {
  if (!hostedKybLooksSubmitted(customer)) return false
  if (verifications.length === 0) return true
  return resolveErrorsLookLikeHostedSubmittedPath(verifications)
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
    if (hostedKybLooksSubmittedAndAwaitingReview(input.customer, verifications)) {
      return "pending"
    }
    return "in_progress"
  }

  return "in_progress"
}

import type { VerificationStatus } from "@/lib/compliance/types"
import { mapGridPartnerStatus } from "@/lib/compliance/map-partner-status"

export type GridVerificationSummary = {
  id?: string | null
  verificationStatus?: string | null
  errors?: Array<{
    type?: string | null
    field?: string | null
    reason?: string | null
    resourceId?: string | null
    acceptedDocumentTypes?: string[] | null
  }> | null
}

export type GridDocumentSummary = {
  id?: string
  documentType?: string | null
  documentHolder?: string | null
}

const GRID_IDENTITY_DOCUMENT_TYPES = new Set(["PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID"])

/** Form-still-incomplete Grid errors — keep the hosted KYB CTA, not action-needed. */
const GRID_MID_FLOW_RESOLVE_ERROR_TYPES = new Set([
  "MISSING_IDENTITY_DOCUMENT",
  "MISSING_DOCUMENT",
  "MISSING_FIELD",
])

export function gridDocumentIsIdentity(documentType: string | null | undefined): boolean {
  return GRID_IDENTITY_DOCUMENT_TYPES.has(normStatus(documentType))
}

export function gridVerificationsMissingIdentityDocument(
  verifications: GridVerificationSummary[],
): boolean {
  return verifications.some((v) =>
    (Array.isArray(v.errors) ? v.errors : []).some(
      (error) => normStatus(error.type) === "MISSING_IDENTITY_DOCUMENT",
    ),
  )
}

export function gridDocumentsIncludeIdentity(documents: GridDocumentSummary[]): boolean {
  return documents.some((doc) => gridDocumentIsIdentity(doc.documentType))
}

/**
 * Grid asked the customer to fix submitted documents (poor quality, screenshot,
 * suspected fraud, expired, etc.) — not merely "upload the UBO ID to continue".
 */
export function gridVerificationsRequireUserFix(verifications: GridVerificationSummary[]): boolean {
  return verifications.some((v) => {
    if (normStatus(v.verificationStatus) !== "RESOLVE_ERRORS") return false
    const errors = Array.isArray(v.errors) ? v.errors : []
    return errors.some((error) => {
      const type = normStatus(error.type)
      return Boolean(type) && !GRID_MID_FLOW_RESOLVE_ERROR_TYPES.has(type)
    })
  })
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
    // IN_PROGRESS / READY_FOR_VERIFICATION are job states — not proof the UBO ID is on Grid.
    return s === "PENDING_MANUAL_REVIEW"
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
  /** Grid `/documents` — UBO ID upload does not show on the customer GET. */
  documents?: GridDocumentSummary[]
}): VerificationStatus {
  const raw = normStatus(String(input.customer.kybStatus ?? input.customer.kycStatus ?? ""))
  if (raw !== "PENDING") {
    return mapGridPartnerStatus(raw)
  }

  const verifications = input.verifications ?? []
  const documents = input.documents ?? []

  // Submitted docs failed Grid review — action-needed, even if an ID file exists.
  if (gridVerificationsRequireUserFix(verifications)) {
    return "hold"
  }

  // Grid dashboard "owner needs ID" — keep the Settings CTA (View progress).
  if (gridVerificationsMissingIdentityDocument(verifications)) {
    return "in_progress"
  }

  if (gridDocumentsIncludeIdentity(documents)) {
    return "pending"
  }

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

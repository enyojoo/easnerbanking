import type { VerificationStatus } from "./types"

/** Map Grid kybStatus / kycStatus to canonical verification_status. */
export function mapGridPartnerStatus(raw: string | null | undefined): VerificationStatus {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
  if (s === "APPROVED") return "approved"
  if (s === "REJECTED") return "rejected"
  if (s === "HOLD") return "hold"
  if (s === "PENDING" || s === "UNVERIFIED") return "pending"
  return "not_started"
}

/** Map Noah noah_kyc_status / noah_kyb_status to canonical verification_status. */
export function mapNoahPartnerStatus(raw: string | null | undefined): VerificationStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (s === "approved") return "approved"
  if (s === "rejected") return "rejected"
  if (s === "hold") return "hold"
  if (s === "pending" || s === "in_review" || s === "under_review" || s.includes("review")) {
    return "pending"
  }
  return "not_started"
}

export function isVerificationApproved(status: VerificationStatus | string | null | undefined): boolean {
  return String(status ?? "").toLowerCase() === "approved"
}

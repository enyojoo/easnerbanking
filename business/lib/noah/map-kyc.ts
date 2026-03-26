/**
 * Map Noah verification / customer payload to legacy `noah_kyc_status` column used by mobile.
 */
export function mapNoahVerificationToKycStatus(customer: Record<string, unknown>): string {
  const ver = customer.Verifications as Record<string, unknown> | undefined
  const status = String(ver?.Status ?? "").toLowerCase()

  if (status.includes("approv")) return "approved"
  if (status.includes("declin") || status.includes("reject")) return "rejected"
  if (status.includes("pend") || status.includes("review")) return "under_review"

  const legacy = customer.Verification as { Status?: string } | undefined
  const ls = legacy?.Status?.toLowerCase() ?? ""
  if (ls.includes("approv")) return "approved"
  if (ls.includes("declin")) return "rejected"
  if (ls.includes("pend")) return "under_review"

  return "not_started"
}

/** Mobile `getCustomerStatus` / dashboard — human-readable KYC string */
export function mapNoahCustomerToMobileSummary(
  customer: Record<string, unknown>,
  customerId: string
): {
  hasCustomer: boolean
  customerId: string
  kycStatus: string
  rejectionReasons: unknown | null
} {
  return {
    hasCustomer: true,
    customerId,
    kycStatus: mapNoahVerificationToKycStatus(customer),
    rejectionReasons: null,
  }
}

/**
 * Consumer Global banking: personal KYC approved.
 * Prefer progressed canonical `verification_status`; if missing/`not_started`, fall back to Noah mirror
 * (matches server `canonicalVerificationStatus` for non-Grid SoR).
 */
export function isGlobalBankingVerified(
  profile:
    | {
        verification_status?: string | null
        noah_kyc_status?: string | null
        profile?: {
          verification_status?: string | null
          noah_kyc_status?: string | null
        }
      }
    | null
    | undefined,
): boolean {
  const direct = String(
    profile?.verification_status ?? profile?.profile?.verification_status ?? "",
  )
    .trim()
    .toLowerCase()
  if (
    direct === "approved" ||
    direct === "pending" ||
    direct === "rejected" ||
    direct === "hold"
  ) {
    return direct === "approved"
  }
  const noah = String(
    profile?.noah_kyc_status ?? profile?.profile?.noah_kyc_status ?? "",
  )
    .trim()
    .toLowerCase()
  return noah === "approved"
}

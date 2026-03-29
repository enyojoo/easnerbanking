/**
 * Until African banking (Tier 2) is available in the app — gate local rails in UI.
 */
export const TIER2_COMPLETE_PLACEHOLDER = false

/**
 * Easner Tier 1 (mobile / B2C): personal identity verification complete when individual KYC is approved.
 */
export function isTier1Complete(
  profile:
    | {
        noah_kyc_status?: string | null
        profile?: { noah_kyc_status?: string | null }
      }
    | null
    | undefined,
): boolean {
  const status = profile?.noah_kyc_status ?? profile?.profile?.noah_kyc_status
  return status === "approved"
}

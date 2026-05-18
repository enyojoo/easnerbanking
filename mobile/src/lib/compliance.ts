/**
 * Until African banking (Tier 2) is available in the app — gate local rails in UI.
 */
export const TIER2_COMPLETE_PLACEHOLDER = false

/** Cards / Tier 3 — not wired yet; More tab badge uses this with Tier 2 for “Tier x” display. */
export const TIER3_COMPLETE_PLACEHOLDER = false

/**
 * Consumer mobile Tier 1: personal KYC approved (`users.noah_kyc_status === 'approved'`).
 * Business users sign in on business web only.
 */
export function isTier1Complete(
  profile:
    | {
        noah_kyc_status?: string | null
        profile?: {
          noah_kyc_status?: string | null
        }
      }
    | null
    | undefined,
): boolean {
  const status = profile?.noah_kyc_status ?? profile?.profile?.noah_kyc_status
  return String(status ?? "")
    .trim()
    .toLowerCase() === "approved"
}

/**
 * Until African banking (Tier 2) is available in the app — gate local rails in UI.
 */
export const TIER2_COMPLETE_PLACEHOLDER = false

/** Cards / Tier 3 — not wired yet; More tab badge uses this with Tier 2 for “Tier x” display. */
export const TIER3_COMPLETE_PLACEHOLDER = false

/**
 * Easner Tier 1: individual users → personal KYC approved; business users → org KYB approved
 * (aligned with `business/lib/pricing/evaluator.ts` role-based status).
 */
export function isTier1Complete(
  profile:
    | {
        role?: "individual" | "business" | null
        noah_kyc_status?: string | null
        noah_kyb_status?: string | null
        profile?: {
          role?: "individual" | "business" | null
          noah_kyc_status?: string | null
          noah_kyb_status?: string | null
        }
      }
    | null
    | undefined,
): boolean {
  const role = profile?.role ?? profile?.profile?.role
  if (role === "business") {
    const kyb = profile?.noah_kyb_status ?? profile?.profile?.noah_kyb_status
    return String(kyb ?? "")
      .trim()
      .toLowerCase() === "approved"
  }
  const status = profile?.noah_kyc_status ?? profile?.profile?.noah_kyc_status
  return String(status ?? "")
    .trim()
    .toLowerCase() === "approved"
}

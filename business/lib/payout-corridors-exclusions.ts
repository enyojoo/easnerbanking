/**
 * Noah exposes `XX` for international USD (Swift). Easner uses `US` for United States USD send.
 */
export const EXCLUDED_PAYOUT_CORRIDOR_COUNTRY_CODES = new Set(["XX"])

export function isExcludedPayoutCorridorCountry(countryCode: string): boolean {
  return EXCLUDED_PAYOUT_CORRIDOR_COUNTRY_CODES.has(String(countryCode || "").trim().toUpperCase())
}

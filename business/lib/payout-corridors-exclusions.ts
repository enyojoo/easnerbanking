/**
 * Noah exposes `XX` for international USD (Swift). Easner uses `US` for United States USD send.
 */
export const EXCLUDED_PAYOUT_CORRIDOR_COUNTRY_CODES = new Set(["XX"])

/** Product exclusions – corridor targets we never provision or keep. */
const EXCLUDED_PAYOUT_CORRIDOR_TARGETS = new Set(["NG:NGN:mobile_money"])

export function isExcludedPayoutCorridorCountry(countryCode: string): boolean {
  return EXCLUDED_PAYOUT_CORRIDOR_COUNTRY_CODES.has(String(countryCode || "").trim().toUpperCase())
}

export function corridorTargetKey(
  countryCode: string,
  currencyCode: string,
  rail: string,
): string {
  const railNorm = rail === "mobile_money" ? "mobile_money" : "bank_transfer"
  return `${String(countryCode || "").trim().toUpperCase()}:${String(currencyCode || "").trim().toUpperCase()}:${railNorm}`
}

export function isExcludedPayoutCorridorTarget(
  countryCode: string,
  currencyCode: string,
  rail: string,
): boolean {
  return EXCLUDED_PAYOUT_CORRIDOR_TARGETS.has(corridorTargetKey(countryCode, currencyCode, rail))
}

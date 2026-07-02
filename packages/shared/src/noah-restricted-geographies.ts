/**
 * Noah restricted geographies pre-screen aid (static table).
 * UK (GB) is never blocked per Noah guidance. Runtime API 403 is authoritative for products.
 * @see https://noah.com/en/uk/restricted-geos
 */

/** ISO2 codes restricted for USD/EUR virtual account onboarding pre-screen. GB explicitly excluded. */
export const NOAH_RESTRICTED_GEO_ISO2 = new Set<string>([
  // Overlap with Easner prohibited/controlled is handled separately; this set is for Noah-specific gaps.
])

export function isNoahRestrictedGeography(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return false
  if (code === "GB") return false
  return NOAH_RESTRICTED_GEO_ISO2.has(code)
}

export function isCountryAllowedForNoahPreScreen(countryCode: string | null | undefined): boolean {
  return !isNoahRestrictedGeography(countryCode)
}

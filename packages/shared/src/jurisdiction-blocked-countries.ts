/**
 * ISO 3166-1 alpha-2 codes blocked per Easner KYC/KYB policy.
 * Keep in sync with docs/legal/compliance.md §3 (Prohibited and Controlled jurisdictions).
 */

/** Prohibited — no onboarding or services. */
export const EASNER_PROHIBITED_JURISDICTION_ISO2 = [
  "CU", // Cuba
  "IR", // Iran
  "MM", // Myanmar
  "KP", // North Korea
  "SY", // Syria
] as const

/**
 * Controlled — not available except specially approved partner programs.
 * Not generally available through Easner signup/KYB pickers.
 */
export const EASNER_CONTROLLED_JURISDICTION_ISO2 = [
  "AF", // Afghanistan
  "DZ", // Algeria
  "BD", // Bangladesh
  "BY", // Belarus
  "CN", // China
  "CD", // Congo (Democratic Republic of the)
  "PS", // Gaza Strip / West Bank (Palestinian Territories)
  "HT", // Haiti
  "IQ", // Iraq
  "LB", // Lebanon
  "LY", // Libya
  "MA", // Morocco
  "MZ", // Mozambique
  "NP", // Nepal
  "NI", // Nicaragua
  "MK", // North Macedonia
  "QA", // Qatar
  "PK", // Pakistan
  "RU", // Russia
  "SO", // Somalia
  "SS", // South Sudan
  "SD", // Sudan
  "VE", // Venezuela
  "YE", // Yemen
] as const

const BLOCKED_SET = new Set<string>([
  ...EASNER_PROHIBITED_JURISDICTION_ISO2,
  ...EASNER_CONTROLLED_JURISDICTION_ISO2,
])

export function isEasnerBlockedJurisdiction(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false
  const code = countryCode.trim().toUpperCase()
  return BLOCKED_SET.has(code)
}

export function filterBlockedJurisdictions(codes: string[]): string[] {
  return codes.filter((code) => !isEasnerBlockedJurisdiction(code))
}

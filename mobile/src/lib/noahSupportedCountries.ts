// Partner-aligned country filter — excludes Prohibited and Controlled jurisdictions.
// Legal reference (keep in sync): docs/legal/compliance.md §3

import { isEasnerBlockedJurisdiction } from '@easner/shared'

/**
 * Check if a country code (ISO alpha-2) is supported for Easner onboarding.
 * Returns false for Prohibited and Controlled jurisdictions.
 */
export function isNoahSupportedCountry(countryCode: string): boolean {
  return !isEasnerBlockedJurisdiction(countryCode)
}

/**
 * Filter an array of countries to only include supported jurisdictions.
 */
export function filterNoahSupportedCountries<T extends { code: string }>(
  countries: T[],
): T[] {
  return countries.filter((country) => isNoahSupportedCountry(country.code))
}

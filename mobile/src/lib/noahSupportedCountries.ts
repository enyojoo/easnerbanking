// Mobile signup/residence – Noah fully prohibited VA list (product-split).
// Legal reference (keep in sync): docs/legal/compliance.md §3

import { isBlockedForMobile } from '@easner/shared'

/**
 * Check if a country code (ISO alpha-2) is supported for Mobile onboarding.
 */
export function isNoahSupportedCountry(countryCode: string): boolean {
  return !isBlockedForMobile(countryCode)
}

/**
 * Filter an array of countries to only include supported jurisdictions.
 */
export function filterNoahSupportedCountries<T extends { code: string }>(
  countries: T[],
): T[] {
  return countries.filter((country) => isNoahSupportedCountry(country.code))
}

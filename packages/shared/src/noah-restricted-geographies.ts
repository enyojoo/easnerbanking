/**
 * Noah fully prohibited VA residences (Mobile signup / pre-screen).
 * Delegates to product-split Mobile hard blocks (includes GB).
 * @see https://noah.com/en/uk/restricted-geos
 * @see ./jurisdiction-blocked-countries.ts
 */

import {
  NOAH_FULLY_PROHIBITED_VA_ISO2,
  isBlockedForMobile,
} from "./jurisdiction-blocked-countries"

/** ISO2 codes fully prohibited for Noah VA onboarding pre-screen (includes GB). */
export const NOAH_RESTRICTED_GEO_ISO2 = new Set<string>(NOAH_FULLY_PROHIBITED_VA_ISO2)

export function isNoahRestrictedGeography(countryCode: string | null | undefined): boolean {
  return isBlockedForMobile(countryCode)
}

export function isCountryAllowedForNoahPreScreen(countryCode: string | null | undefined): boolean {
  return !isNoahRestrictedGeography(countryCode)
}

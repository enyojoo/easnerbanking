/**
 * Business jurisdiction gates — Grid hard-blocks only.
 */

import { isBlockedForBusiness } from "@easner/shared"

export type JurisdictionSurface = "signup" | "kyb" | "individual_residence"

/**
 * Whether a country is allowed for a Business surface.
 * Empty country is required for individual residence; optional for signup/KYB.
 */
export function isCountryAllowedForSurface(
  countryCode: string | null | undefined,
  surface: JurisdictionSurface,
): boolean {
  if (!countryCode) return surface === "individual_residence" ? false : true
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return false
  return !isBlockedForBusiness(code)
}

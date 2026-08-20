/**
 * Product-split jurisdiction hard blocks.
 * Keep in sync with docs/legal/compliance.md §3.
 *
 * Business signup/KYB → Grid main prohibited residences.
 * Mobile signup/residence → Noah fully prohibited VA residences (incl. GB).
 * Grid digital-asset extras → signup allowed; exclude Grid payout rails only.
 */

export type JurisdictionProduct = "business" | "mobile"

/** Lightspark Grid main prohibited jurisdictions (onboarding / residence). */
export const GRID_PROHIBITED_RESIDENCE_ISO2 = [
  "AF", // Afghanistan
  "BY", // Belarus
  "BT", // Bhutan
  "BI", // Burundi
  "CD", // Congo (Democratic Republic of the)
  "CU", // Cuba
  "PS", // Gaza Strip / West Bank (Palestinian Territories)
  "GW", // Guinea-Bissau
  "HT", // Haiti
  "IR", // Iran
  "IQ", // Iraq
  "KE", // Kenya
  "XK", // Kosovo
  "LB", // Lebanon
  "LY", // Libya
  "MZ", // Mozambique
  "MM", // Myanmar
  "KP", // North Korea
  "PK", // Pakistan
  "QA", // Qatar
  "RU", // Russia
  "SO", // Somalia
  "SS", // South Sudan
  "SD", // Sudan
  "SY", // Syria
  "VE", // Venezuela
  "YE", // Yemen
  "ZW", // Zimbabwe
] as const

/**
 * Noah fully prohibited VA residences (no VA on listed rails).
 * Includes GB – Mobile blocks UK signup; Business keeps GB open.
 */
export const NOAH_FULLY_PROHIBITED_VA_ISO2 = [
  "AF", // Afghanistan
  "BF", // Burkina Faso
  "BY", // Belarus
  "CD", // Congo (Democratic Republic of the)
  "CF", // Central African Republic
  "CU", // Cuba
  "GB", // United Kingdom
  "GW", // Guinea-Bissau
  "HT", // Haiti
  "IQ", // Iraq
  "IR", // Iran
  "KP", // North Korea
  "LB", // Lebanon
  "LY", // Libya
  "ML", // Mali
  "MM", // Myanmar
  "MZ", // Mozambique
  "NI", // Nicaragua
  "PA", // Panama
  "PK", // Pakistan
  "PS", // Palestinian Territory
  "RU", // Russia
  "SD", // Sudan
  "SO", // Somalia
  "SS", // South Sudan
  "SY", // Syria
  "UA", // Ukraine
  "VE", // Venezuela
  "VU", // Vanuatu
  "YE", // Yemen
  "ZW", // Zimbabwe
] as const

/**
 * Grid digital-asset extra prohibited residences.
 * Signup allowed; balance/corridor payouts must not use Grid.
 */
export const GRID_DIGITAL_ASSET_EXTRA_ISO2 = [
  "DZ", // Algeria
  "BD", // Bangladesh
  "CN", // China
  "MA", // Morocco
  "NP", // Nepal
] as const

/** @deprecated Use GRID_PROHIBITED_RESIDENCE_ISO2 – transitional alias for shared sanctions core. */
export const EASNER_PROHIBITED_JURISDICTION_ISO2 = [
  "CU",
  "IR",
  "MM",
  "KP",
  "SY",
] as const

/** @deprecated Controlled split retired – empty for transitional imports. */
export const EASNER_CONTROLLED_JURISDICTION_ISO2 = [] as const

const BUSINESS_BLOCKED = new Set<string>(GRID_PROHIBITED_RESIDENCE_ISO2)
const MOBILE_BLOCKED = new Set<string>(NOAH_FULLY_PROHIBITED_VA_ISO2)
const GRID_DIGITAL_ASSET = new Set<string>(GRID_DIGITAL_ASSET_EXTRA_ISO2)

function normalizeIso2(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return null
  return code
}

export function isBlockedForBusiness(countryCode: string | null | undefined): boolean {
  const code = normalizeIso2(countryCode)
  if (!code) return false
  return BUSINESS_BLOCKED.has(code)
}

export function isBlockedForMobile(countryCode: string | null | undefined): boolean {
  const code = normalizeIso2(countryCode)
  if (!code) return false
  return MOBILE_BLOCKED.has(code)
}

export function isGridDigitalAssetJurisdiction(countryCode: string | null | undefined): boolean {
  const code = normalizeIso2(countryCode)
  if (!code) return false
  return GRID_DIGITAL_ASSET.has(code)
}

/** Business signup/KYB alias – prefer isBlockedForBusiness at new call sites. */
export function isEasnerBlockedJurisdiction(countryCode: string | null | undefined): boolean {
  return isBlockedForBusiness(countryCode)
}

export function filterBlockedJurisdictions(codes: string[]): string[] {
  return filterBlockedJurisdictionsForProduct("business", codes)
}

export function filterBlockedJurisdictionsForProduct(
  product: JurisdictionProduct,
  codes: string[],
): string[] {
  const blocked = product === "mobile" ? isBlockedForMobile : isBlockedForBusiness
  return codes.filter((code) => !blocked(code))
}

export type CountryCatalogEntry = { name: string; code: string }

/** Signup/KYB picker: catalog minus product hard-blocks. */
export function filterCountriesForProductPicker<T extends CountryCatalogEntry>(
  catalog: T[],
  product: JurisdictionProduct,
): T[] {
  return catalog.filter((row) => {
    const code = String(row.code || "").trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) return false
    return product === "mobile" ? !isBlockedForMobile(code) : !isBlockedForBusiness(code)
  })
}

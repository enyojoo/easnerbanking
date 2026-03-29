/**
 * Deterministic Noah CustomerID (Standard Model hosted onboarding).
 * @see https://docs.noah.com/recipes/onboarding/hosted-onboarding/
 *
 * - `individual` — Easner Banking **mobile** consumer KYC (`CustomerType: Individual`).
 * - `business` — Easner Banking **business** web KYB (`CustomerType: Business`).
 */
export type NoahCustomerScope = "individual" | "business"

/** Business scope — must keep total ID ≤ 42 chars (Noah onboarding UI / Zodios). `ebiz_` (5) + UUID hex (32) = 37. */
export const EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX = "ebiz_" as const

/** Individual (mobile KYC) — `eind_` (5) + UUID hex (32) = 37; aligns naming with `ebiz_`. */
export const EASNER_NOAH_INDIVIDUAL_CUSTOMER_PREFIX = "eind_" as const

/** Legacy business prefix (43 chars); still parsed for webhooks and old Noah rows. */
const LEGACY_EASNER_BUSINESS_PREFIX = "easner_biz_"

/** Legacy individual prefix; still parsed for webhooks and old Noah rows. */
const LEGACY_EASNER_INDIVIDUAL_PREFIX = "easner_"

export function noahCustomerIdFromUserId(userId: string, scope: NoahCustomerScope = "individual"): string {
  const compact = userId.replace(/-/g, "")
  if (scope === "business") {
    return `${EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX}${compact}`
  }
  return `${EASNER_NOAH_INDIVIDUAL_CUSTOMER_PREFIX}${compact}`
}

/** Which Noah customer id matches this path segment, if any (for :customerId routes). */
export function parseNoahScopeFromPathCustomerId(userId: string, customerId: string): NoahCustomerScope | null {
  if (customerId === noahCustomerIdFromUserId(userId, "individual")) return "individual"
  if (customerId === noahCustomerIdFromUserId(userId, "business")) return "business"
  return null
}

function compactUuidToUuid(hex32: string): string | null {
  if (!/^[0-9a-fA-F]{32}$/.test(hex32)) return null
  const h = hex32.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/**
 * Reverse deterministic CustomerIDs from hosted onboarding (`eind_*`, `ebiz_*`, legacy `easner_*`, `easner_biz_*`).
 */
export function parseEasnerUserIdFromNoahCustomerId(customerId: string): { userId: string; scope: NoahCustomerScope } | null {
  if (customerId.startsWith(LEGACY_EASNER_BUSINESS_PREFIX)) {
    const hex = customerId.slice(LEGACY_EASNER_BUSINESS_PREFIX.length)
    const userId = compactUuidToUuid(hex)
    if (!userId) return null
    return { userId, scope: "business" }
  }
  if (customerId.startsWith(EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX)) {
    const hex = customerId.slice(EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX.length)
    const userId = compactUuidToUuid(hex)
    if (!userId) return null
    return { userId, scope: "business" }
  }
  if (customerId.startsWith(EASNER_NOAH_INDIVIDUAL_CUSTOMER_PREFIX)) {
    const hex = customerId.slice(EASNER_NOAH_INDIVIDUAL_CUSTOMER_PREFIX.length)
    const userId = compactUuidToUuid(hex)
    if (!userId) return null
    return { userId, scope: "individual" }
  }
  if (customerId.startsWith(LEGACY_EASNER_INDIVIDUAL_PREFIX)) {
    const hex = customerId.slice(LEGACY_EASNER_INDIVIDUAL_PREFIX.length)
    const userId = compactUuidToUuid(hex)
    if (!userId) return null
    return { userId, scope: "individual" }
  }
  return null
}

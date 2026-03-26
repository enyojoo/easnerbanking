/**
 * Deterministic Noah CustomerID (Standard Model hosted onboarding).
 * @see https://docs.noah.com/recipes/onboarding/hosted-onboarding/
 *
 * - `individual` — Easner Banking **mobile** consumer KYC (`CustomerType: Individual`).
 * - `business` — Easner Banking **business** web KYB (`CustomerType: Business`).
 */
export type NoahCustomerScope = "individual" | "business"

export function noahCustomerIdFromUserId(userId: string, scope: NoahCustomerScope = "individual"): string {
  const compact = userId.replace(/-/g, "")
  if (scope === "business") {
    return `easner_biz_${compact}`
  }
  return `easner_${compact}`
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
 * Reverse deterministic CustomerIDs from hosted onboarding (`easner_*` / `easner_biz_*`).
 */
export function parseEasnerUserIdFromNoahCustomerId(customerId: string): { userId: string; scope: NoahCustomerScope } | null {
  if (customerId.startsWith("easner_biz_")) {
    const hex = customerId.slice("easner_biz_".length)
    const userId = compactUuidToUuid(hex)
    if (!userId) return null
    return { userId, scope: "business" }
  }
  if (customerId.startsWith("easner_")) {
    const hex = customerId.slice("easner_".length)
    const userId = compactUuidToUuid(hex)
    if (!userId) return null
    return { userId, scope: "individual" }
  }
  return null
}

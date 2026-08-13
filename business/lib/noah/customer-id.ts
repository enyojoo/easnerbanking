/**
 * Deterministic Noah CustomerID (Standard Model hosted onboarding).
 * @see https://docs.noah.com/recipes/onboarding/hosted-onboarding/
 *
 * - `eind_` — consumer KYC (`CustomerType: Individual`) keyed to `users.id`.
 * - `ebiz_` — business KYB (`CustomerType: Business`) keyed to `businesses.id`.
 */
export type NoahCustomerScope = "individual" | "business"

/** B2B — `ebiz_` (5) + UUID hex (32) = 37 (Noah ID length budget). */
export const EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX = "ebiz_" as const

/** Consumer — `eind_` (5) + UUID hex (32) = 37. */
export const EASNER_NOAH_INDIVIDUAL_CUSTOMER_PREFIX = "eind_" as const

/** Legacy individual prefix; still parsed for old Noah rows. */
const LEGACY_EASNER_INDIVIDUAL_PREFIX = "easner_"

export function compactUuidForNoahCustomerId(id: string): string {
  return id.replace(/-/g, "")
}

export function noahCustomerIdFromUserId(userId: string): string {
  return `${EASNER_NOAH_INDIVIDUAL_CUSTOMER_PREFIX}${compactUuidForNoahCustomerId(userId)}`
}

export function noahCustomerIdFromBusinessId(businessId: string): string {
  return `${EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX}${compactUuidForNoahCustomerId(businessId)}`
}

export type ParsedEasnerNoahCustomer =
  | { kind: "individual"; userId: string }
  | { kind: "business"; businessId: string }

/** Session may access this Noah `customerId` (GET /customers/:id, sync, etc.). */
export function customerIdAllowedForSession(opts: {
  sessionUserId: string
  easnerBusinessId: string | null
  customerId: string
  /** From `users.noah_customer_id` when Noah returned a non–Easner-shaped id. */
  userStoredNoahCustomerId?: string | null
  /** Legacy Noah id override when stored separately from deterministic `ebiz_` (business scope only). */
  businessStoredNoahCustomerId?: string | null
}): NoahCustomerScope | null {
  const {
    sessionUserId,
    easnerBusinessId,
    customerId,
    userStoredNoahCustomerId,
    businessStoredNoahCustomerId,
  } = opts
  const userStored = userStoredNoahCustomerId?.trim()
  if (userStored && customerId === userStored) return "individual"
  if (customerId === noahCustomerIdFromUserId(sessionUserId)) return "individual"
  /** Noah may use compact UUID as CustomerID (no `eind_` prefix) while Easner defaults to `eind_`. */
  if (customerId === compactUuidForNoahCustomerId(sessionUserId)) return "individual"
  if (easnerBusinessId) {
    const bizStored = businessStoredNoahCustomerId?.trim()
    if (bizStored && customerId === bizStored) return "business"
    if (customerId === noahCustomerIdFromBusinessId(easnerBusinessId)) return "business"
  }
  return null
}

function compactUuidToUuid(hex32: string): string | null {
  if (!/^[0-9a-fA-F]{32}$/.test(hex32)) return null
  const h = hex32.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/**
 * Parse Easner-shaped Noah CustomerIDs (`eind_*`, `ebiz_*`, legacy consumer `easner_*` only).
 */
export function parseEasnerNoahCustomerId(customerId: string): ParsedEasnerNoahCustomer | null {
  if (customerId.startsWith(EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX)) {
    const hex = customerId.slice(EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX.length)
    const businessId = compactUuidToUuid(hex)
    if (!businessId) return null
    return { kind: "business", businessId }
  }
  if (customerId.startsWith(EASNER_NOAH_INDIVIDUAL_CUSTOMER_PREFIX)) {
    const hex = customerId.slice(EASNER_NOAH_INDIVIDUAL_CUSTOMER_PREFIX.length)
    const userId = compactUuidToUuid(hex)
    if (!userId) return null
    return { kind: "individual", userId }
  }
  if (customerId.startsWith(LEGACY_EASNER_INDIVIDUAL_PREFIX)) {
    const hex = customerId.slice(LEGACY_EASNER_INDIVIDUAL_PREFIX.length)
    const userId = compactUuidToUuid(hex)
    if (!userId) return null
    return { kind: "individual", userId }
  }
  return null
}

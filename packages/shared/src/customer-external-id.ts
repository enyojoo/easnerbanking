/** Canonical Easner external customer ids for Grid `platformCustomerId`. */

export const EASNER_BUSINESS_EXTERNAL_PREFIX = "eb_" as const
export const EASNER_INDIVIDUAL_EXTERNAL_PREFIX = "ei_" as const

export function compactUuid(id: string): string {
  return String(id || "").trim().replace(/-/g, "")
}

export function ebFromBusinessId(businessId: string): string {
  const id = String(businessId || "").trim()
  if (!id) throw new Error("businessId is required for eb_ external customer id")
  return `${EASNER_BUSINESS_EXTERNAL_PREFIX}${compactUuid(id)}`
}

export function eiFromUserId(userId: string): string {
  const id = String(userId || "").trim()
  if (!id) throw new Error("userId is required for ei_ external customer id")
  return `${EASNER_INDIVIDUAL_EXTERNAL_PREFIX}${compactUuid(id)}`
}

export type ParsedGridPlatformCustomerId =
  | { kind: "business"; businessId: string }
  | { kind: "individual"; userId: string }

function compactUuidToUuid(hex32: string): string | null {
  if (!/^[0-9a-fA-F]{32}$/.test(hex32)) return null
  const h = hex32.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** Parse canonical Grid `platformCustomerId` (`eb_` / `ei_`) back to Easner subject id. */
export function parseGridPlatformCustomerId(id: string): ParsedGridPlatformCustomerId | null {
  const trimmed = String(id || "").trim()
  if (trimmed.startsWith(EASNER_BUSINESS_EXTERNAL_PREFIX)) {
    const businessId = compactUuidToUuid(trimmed.slice(EASNER_BUSINESS_EXTERNAL_PREFIX.length))
    if (!businessId) return null
    return { kind: "business", businessId }
  }
  if (trimmed.startsWith(EASNER_INDIVIDUAL_EXTERNAL_PREFIX)) {
    const userId = compactUuidToUuid(trimmed.slice(EASNER_INDIVIDUAL_EXTERNAL_PREFIX.length))
    if (!userId) return null
    return { kind: "individual", userId }
  }
  return null
}

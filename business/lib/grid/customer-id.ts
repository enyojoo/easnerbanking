/** Deterministic Grid platformCustomerId for Easner users/businesses. */
import { createHash } from "crypto"
import { ebFromBusinessId, eiFromUserId } from "@easner/shared"

export function gridPlatformCustomerIdFromUserId(userId: string): string {
  return eiFromUserId(userId)
}

export function gridPlatformCustomerIdFromBusinessId(businessId: string): string {
  return ebFromBusinessId(businessId)
}

/** One-time platform id so POST /customers is not an idempotent replay of a deleted customer. */
export function gridPlatformCustomerIdFresh(businessId: string, nonce = Date.now()): string {
  return `${gridPlatformCustomerIdFromBusinessId(businessId)}_g${nonce}`
}

/** Unrelated `eb_` id – Grid 404s if the new id is a prefix of a deleted customer's platform id. */
export function gridPlatformCustomerIdRandom(): string {
  return ebFromBusinessId(crypto.randomUUID())
}

/** UUID derived from a seed so concurrent creates share one platform id. */
export function uuidFromStableSeed(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex")
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`
}

/**
 * Stable replacement `eb_` after the canonical id is tombstoned.
 * Must not be a prefix of the deleted canonical id (Grid returns CUSTOMER_NOT_FOUND).
 */
export function gridPlatformCustomerIdForRecreate(businessId: string, generation = 1): string {
  const gen = Math.max(1, Math.floor(generation))
  return ebFromBusinessId(uuidFromStableSeed(`easner-grid-recreate:${gen}:${businessId.trim()}`))
}

export function gridPlatformCustomerIdForSubject(input: {
  userId: string
  businessId?: string | null
  scope?: "individual" | "business"
}): string {
  if (input.scope === "business" && input.businessId) {
    return gridPlatformCustomerIdFromBusinessId(input.businessId)
  }
  return gridPlatformCustomerIdFromUserId(input.userId)
}

/** Deterministic Grid platformCustomerId for Easner users/businesses. */
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

/** Unrelated `eb_` id — Grid 404s if the new id is a prefix of a deleted customer's platform id. */
export function gridPlatformCustomerIdRandom(): string {
  return ebFromBusinessId(crypto.randomUUID())
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

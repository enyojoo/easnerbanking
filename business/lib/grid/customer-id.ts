/** Deterministic Grid platformCustomerId for Easner users/businesses. */
import { ebFromBusinessId, eiFromUserId } from "@easner/shared"

export function gridPlatformCustomerIdFromUserId(userId: string): string {
  return eiFromUserId(userId)
}

export function gridPlatformCustomerIdFromBusinessId(businessId: string): string {
  return ebFromBusinessId(businessId)
}

/** Use `_g2+` when Grid still reserves the canonical id on a deleted customer. */
export function gridPlatformCustomerIdWithGeneration(businessId: string, generation: number): string {
  const canonical = gridPlatformCustomerIdFromBusinessId(businessId)
  if (generation <= 1) return canonical
  return `${canonical}_g${generation}`
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

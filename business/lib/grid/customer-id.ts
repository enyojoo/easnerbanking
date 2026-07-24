/** Deterministic Grid platformCustomerId for Easner users/businesses. */

export function gridPlatformCustomerIdFromUserId(userId: string): string {
  const id = String(userId || "").trim()
  if (!id) throw new Error("userId is required for Grid platformCustomerId")
  return `easner_user_${id}`
}

export function gridPlatformCustomerIdFromBusinessId(businessId: string): string {
  const id = String(businessId || "").trim()
  if (!id) throw new Error("businessId is required for Grid platformCustomerId")
  return `easner_business_${id}`
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

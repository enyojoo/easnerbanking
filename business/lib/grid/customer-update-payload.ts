/** Grid PATCH /customers uses a oneOf body keyed by `customerType`. */
export function gridBusinessCustomerUpdatePayload(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { customerType: "BUSINESS", ...patch }
}

export function gridIndividualCustomerUpdatePayload(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { customerType: "INDIVIDUAL", ...patch }
}

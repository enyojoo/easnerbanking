/** HTTP header for personal vs org account context (wallets, ledger, deposits). */
export const EASNER_ACCOUNT_SCOPE_HEADER = "X-Easner-Account-Scope" as const

/**
 * Legacy header name – still accepted by the API during client rollout.
 * @deprecated Prefer {@link EASNER_ACCOUNT_SCOPE_HEADER}
 */
export const EASNER_ACCOUNT_SCOPE_HEADER_LEGACY = "X-Easner-Noah-Scope" as const

export const ACCOUNT_SCOPE_INDIVIDUAL_HEADERS = {
  [EASNER_ACCOUNT_SCOPE_HEADER]: "individual",
} as const

export const ACCOUNT_SCOPE_BUSINESS_HEADERS = {
  [EASNER_ACCOUNT_SCOPE_HEADER]: "business",
} as const

export type EasnerAccountScope = "individual" | "business"

/** Read account scope from request headers (new name first, then legacy). */
export function readAccountScopeFromHeaders(
  getHeader: (name: string) => string | null,
): string | null {
  const raw =
    getHeader("x-easner-account-scope") ?? getHeader("x-easner-noah-scope")
  return raw?.trim().toLowerCase() || null
}

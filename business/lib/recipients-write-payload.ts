/** Shared recipients table write shape (API + store). */
export type RecipientWritePayload = {
  country_code?: string | null
  full_name: string
  account_number: string
  bank_name: string
  phone_number?: string | null
  email?: string | null
  currency: string
  routing_number?: string | null
  sort_code?: string | null
  iban?: string | null
  swift_bic?: string | null
  transfer_type?: "ACH" | "Wire" | null
  checking_or_savings?: "checking" | "savings" | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  mobile_provider?: string | null
  wallet_network?: string | null
  metadata?: Record<string, unknown> | null
}

/** Subset for DBs missing newer recipient columns — still keeps corridor-critical fields. */
export function toRecipientLegacyPayload(payload: RecipientWritePayload) {
  return {
    country_code: payload.country_code || null,
    full_name: payload.full_name,
    account_number: payload.account_number,
    bank_name: payload.bank_name,
    phone_number: payload.phone_number || null,
    email: payload.email || null,
    currency: payload.currency,
    routing_number: payload.routing_number || null,
    sort_code: payload.sort_code || null,
    iban: payload.iban || null,
    swift_bic: payload.swift_bic || null,
    transfer_type: payload.transfer_type || null,
    checking_or_savings: payload.checking_or_savings || null,
    address_line1: payload.address_line1 || null,
    city: payload.city || null,
    state: payload.state || null,
    postal_code: payload.postal_code || null,
    mobile_provider: payload.mobile_provider || null,
    wallet_network: payload.wallet_network || null,
  }
}

export function looksLikeMissingStructuredColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const maybe = error as { message?: string; details?: string; code?: string }
  const text = `${maybe.message || ""} ${maybe.details || ""}`.toLowerCase()
  return maybe.code === "42703" || text.includes("column") || text.includes("schema cache")
}

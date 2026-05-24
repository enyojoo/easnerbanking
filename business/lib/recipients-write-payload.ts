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
  wallet_memo_tag?: string | null
  payee_easetag?: string | null
  payee_avatar_url?: string | null
  payee_account_kind?: string | null
  noah_external_account_id?: string | null
  noah_form_session_id?: string | null
  noah_sell_crypto_authorized?: string | null
  noah_sell_crypto_currency?: string | null
}

export function looksLikeMissingStructuredColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const maybe = error as { message?: string; details?: string; code?: string }
  const text = `${maybe.message || ""} ${maybe.details || ""}`.toLowerCase()
  return maybe.code === "42703" || text.includes("column") || text.includes("schema cache")
}

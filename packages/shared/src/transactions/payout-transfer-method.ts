export type PayoutTransferMethodInput = {
  currency?: string | null
  countryCode?: string | null
  country?: string | null
  bankName?: string | null
  mobileProvider?: string | null
  payeeEasetag?: string | null
}

function normalizeCountry(input: PayoutTransferMethodInput): string {
  const raw = String(input.countryCode || input.country || "").trim().toUpperCase()
  if (raw === "USA" || raw === "UNITED STATES") return "US"
  if (raw === "UNITED KINGDOM") return "GB"
  return raw
}

export function isMobileMoneyPayoutCorridor(input: PayoutTransferMethodInput): boolean {
  const bank = String(input.bankName || "").toLowerCase()
  return bank.includes("mobile money") || Boolean(String(input.mobileProvider || "").trim())
}

/** Corridor label for global payout review, push title, and detail rows. */
export function getGlobalPayoutTransferMethod(input: PayoutTransferMethodInput): string {
  if (String(input.payeeEasetag || "").trim()) return "Easetag (wallet-to-wallet)"
  if (isMobileMoneyPayoutCorridor(input)) return "Local transfer"

  const currency = String(input.currency || "").toUpperCase()
  const country = normalizeCountry(input)

  if (currency === "USD" && country === "US") return "ACH"
  if (currency === "EUR") return "SEPA Instant"
  if (currency === "GBP" && country === "GB") return "Faster Payments"
  return "Local transfer"
}

/**
 * Normalize legacy persisted transfer-method labels to current copy.
 * Old rows may store "Bank transfer", "Mobile money", or "Mobile money transfer".
 */
export function normalizeTransferMethodLabel(raw: string | null | undefined): string {
  const s = String(raw || "").trim()
  if (!s) return ""
  const lower = s.toLowerCase()
  if (lower === "bank transfer") return "Local transfer"
  if (lower === "mobile money" || lower === "mobile money transfer") return "Local transfer"
  return s
}

export function getGlobalPayoutProcessingTime(method: string): string {
  switch (method) {
    case "Easetag (wallet-to-wallet)":
      return "Usually instant"
    case "ACH":
      return "Within 24 hours"
    case "SEPA":
    case "SEPA Instant":
      return "Within minutes"
    case "Faster Payments":
    case "Local transfer":
    case "Mobile money":
    case "Bank transfer":
      return "Within minutes"
    default:
      return "Within minutes"
  }
}

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
  if (isMobileMoneyPayoutCorridor(input)) return "Mobile money"

  const currency = String(input.currency || "").toUpperCase()
  const country = normalizeCountry(input)

  if (currency === "USD" && country === "US") return "ACH"
  if (currency === "EUR") return "SEPA"
  if (currency === "GBP" && country === "GB") return "Faster Payments"
  return "Bank transfer"
}

export function getGlobalPayoutProcessingTime(method: string): string {
  switch (method) {
    case "Easetag (wallet-to-wallet)":
      return "Usually instant"
    case "ACH":
      return "1-3 business days"
    case "SEPA":
      return "1-2 business days"
    case "Faster Payments":
      return "Within minutes"
    case "Mobile money":
    case "Bank transfer":
      return "Same day"
    default:
      return "Same day"
  }
}

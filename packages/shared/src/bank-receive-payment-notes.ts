/** Customer-facing bank receive notes. Do not name providers. */

export type BankReceiveProvider = "grid" | "noah" | "bridge"

export function usdBankReceivePaymentNotes(
  provider: BankReceiveProvider | null | undefined,
): string[] {
  if (provider === "grid") {
    return [
      "Only send via ACH, Wire, RTP, or FedNow.",
      "SWIFT is not supported.",
      "Processing: RTP & FedNow (instant), ACH & Wire (up to 48 hours).",
    ]
  }
  if (provider === "bridge") {
    return [
      "Only send via ACH, Wire, or FedNow.",
      "SWIFT is not supported.",
      "Processing: FedNow (instant), ACH & Wire (up to 48 hours).",
    ]
  }
  return [
    "Only send ACH or Fedwire.",
    "SWIFT is not supported.",
    "Processing time: within a few minutes and up to 48 hours.",
  ]
}

export function eurBankReceivePaymentNotes(): string[] {
  return [
    "Only send SEPA and SEPA Instant.",
    "Processing time: within a few minutes and up to 48 hours.",
  ]
}

export function gbpBankReceivePaymentNotes(): string[] {
  return [
    "Only send Faster Payments or BACS",
    "Processing time: same day or 1–2 business days",
  ]
}

export function ngnBankReceivePaymentNotes(): string[] {
  return ["Processing time: within 24 hours"]
}

export function bankReceivePaymentNotes(input: {
  currency: string
  provider?: BankReceiveProvider | null
}): string[] {
  const currency = String(input.currency ?? "").trim().toUpperCase()
  if (currency === "USD") return usdBankReceivePaymentNotes(input.provider)
  if (currency === "EUR") return eurBankReceivePaymentNotes()
  if (currency === "GBP") return gbpBankReceivePaymentNotes()
  if (currency === "NGN") return ngnBankReceivePaymentNotes()
  return []
}

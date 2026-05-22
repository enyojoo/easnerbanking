/** Returns payment instruction strings for a given currency and type (for PDF or text) */
export function getPaymentInstructions(
  currency: string,
  type: "bank" | "stablecoin"
): string[] {
  if (type === "bank") {
    if (currency === "USD") {
      return [
        "Only send ACH or Fedwire.",
        "SWIFT is not supported.",
        "Processing time: within a few minutes and up to 48 hours.",
      ]
    }
    if (currency === "EUR") {
      return [
        "Only send SEPA and SEPA Instant.",
        "Processing time: within a few minutes and up to 48 hours.",
      ]
    }
    if (currency === "GBP") {
      return [
        "Only send Faster Payments or BACS",
        "Processing time: same day or 1–2 business days",
      ]
    }
    if (currency === "NGN") {
      return ["Processing time: within 24 hours"]
    }
  }
  if (type === "stablecoin") {
    const stablecoin =
      currency === "USD"
        ? "USDC"
        : currency === "EUR"
          ? "EURC"
          : "USDC"
    return [
      `Only send ${stablecoin} on Solana to this address.`,
      "Sending other assets or networks may result in permanent loss.",
      "Processing time: within seconds.",
    ]
  }
  return []
}

/** Pass stablecoin name explicitly for send flow */
export function getStablecoinPaymentInstructions(stablecoin: "USDC" | "USDT"): string[] {
  return [
    `Only send ${stablecoin} on Solana to this address.`,
    "Sending other assets or networks may result in permanent loss.",
    "Processing time: within seconds.",
  ]
}

import { receiveStablecoinPaymentNotes } from "@easner/shared"

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
    return receiveStablecoinPaymentNotes({ asset: stablecoin, network: "Solana" })
  }
  return []
}

/** Tron USDT inbound via open deposit address. */
export function getTronUsdtPaymentInstructions(): string[] {
  return receiveStablecoinPaymentNotes({ asset: "USDT", network: "Tron" })
}

/** Pass stablecoin name explicitly for send flow */
export function getStablecoinPaymentInstructions(stablecoin: "USDC" | "USDT"): string[] {
  if (stablecoin === "USDT") {
    return getTronUsdtPaymentInstructions()
  }
  return receiveStablecoinPaymentNotes({ asset: stablecoin, network: "Solana" })
}

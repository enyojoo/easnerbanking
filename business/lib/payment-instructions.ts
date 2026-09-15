import {
  bankReceivePaymentNotes,
  receiveStablecoinPaymentNotes,
  usdBankReceivePaymentNotes,
  type BankReceiveProvider,
} from "@easner/shared"

/** Grid business USD receive rails (Cross River sponsor bank). */
export function getGridUsdBankPaymentInstructions(): string[] {
  return usdBankReceivePaymentNotes("grid")
}

/** Returns payment instruction strings for a given currency and type (for PDF or text) */
export function getPaymentInstructions(
  currency: string,
  type: "bank" | "stablecoin",
  opts?: { gridUsd?: boolean; usdProvider?: BankReceiveProvider | null },
): string[] {
  if (type === "bank") {
    const usdProvider: BankReceiveProvider | null | undefined =
      opts?.usdProvider ?? (opts?.gridUsd ? "grid" : undefined)
    return bankReceivePaymentNotes({ currency, provider: usdProvider })
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

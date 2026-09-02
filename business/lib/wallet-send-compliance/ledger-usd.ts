import { roundUsd } from "@easner/shared"

/** USDC≈USD; EUR/EURC uses WALLET_SEND_EUR_USD_RATE or 1.1. */
export function ledgerAmountToUsd(amount: number, currency: string | null | undefined): number {
  if (!(amount > 0)) return 0
  const c = String(currency || "USD").trim().toUpperCase()
  if (c === "EUR" || c === "EURC") {
    const rate = Number(process.env.WALLET_SEND_EUR_USD_RATE ?? 1.1)
    return roundUsd(amount * (Number.isFinite(rate) && rate > 0 ? rate : 1.1))
  }
  return roundUsd(amount)
}

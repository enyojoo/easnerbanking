import { isDirectTurnkeyWalletCorridor } from "./wallet-send-limits"

/** Hide fee rows at or below half a cent in USD/EUR (confirm + transaction details). */
export const PAYOUT_REVIEW_FEE_VISIBLE_EPSILON = 0.005

export function isPayoutReviewFeeVisible(amount: number | null | undefined): boolean {
  if (amount == null || !Number.isFinite(amount)) return false
  return amount > PAYOUT_REVIEW_FEE_VISIBLE_EPSILON
}

function normCur(c: string): string {
  return String(c || "").trim().toUpperCase()
}

/** USD↔USDC and EUR↔EURC are 1:1 stablecoin parity (ledger ↔ Solana direct send). */
export function isBalanceStablecoinParity(sendCurrency: string, receiveCurrency: string): boolean {
  const send = normCur(sendCurrency)
  const receive = normCur(receiveCurrency)
  if (send === receive) return true
  return (send === "USD" && receive === "USDC") || (send === "EUR" && receive === "EURC")
}

export function hasPayoutCrossCurrencyFx(sendCurrency: string, receiveCurrency: string): boolean {
  return normCur(sendCurrency) !== normCur(receiveCurrency)
}

/** Hide FX rows for direct Turnkey USDC/EURC · Solana; LI.FI bridges still show rate when cross-asset. */
export function hasWalletSendFxDisplay(
  sendCurrency: string,
  receiveCurrency: string,
  receiveNetwork: string,
): boolean {
  if (
    isDirectTurnkeyWalletCorridor(receiveCurrency, receiveNetwork) &&
    isBalanceStablecoinParity(sendCurrency, receiveCurrency)
  ) {
    return false
  }
  return hasPayoutCrossCurrencyFx(sendCurrency, receiveCurrency)
}

export function shouldShowPayoutExchangeFee(input: {
  sendCurrency: string
  receiveCurrency: string
  exchangeFee: number | null | undefined
}): boolean {
  return (
    hasPayoutCrossCurrencyFx(input.sendCurrency, input.receiveCurrency) &&
    isPayoutReviewFeeVisible(input.exchangeFee)
  )
}

export function shouldShowPayoutProcessingFee(processingFee: number | null | undefined): boolean {
  return isPayoutReviewFeeVisible(processingFee)
}

export function shouldShowPayoutNetworkFee(networkFee: number | null | undefined): boolean {
  return isPayoutReviewFeeVisible(networkFee)
}

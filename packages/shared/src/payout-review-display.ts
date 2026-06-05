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

export type WalletSendExecutionModel = "direct_turnkey" | "lifi_bridge"

/**
 * LI.FI bridge: margin is in `customerRate` / you-send principal — do not show a separate processing fee.
 * Direct Turnkey: explicit 1% (cap 20) fee on top of recipient amount.
 */
export function shouldShowWalletSendProcessingFee(input: {
  executionModel?: WalletSendExecutionModel | string | null
  processingFee?: number | null
}): boolean {
  if (input.executionModel === "lifi_bridge") return false
  return shouldShowPayoutProcessingFee(input.processingFee)
}

export function shouldShowPayoutProcessingFee(processingFee: number | null | undefined): boolean {
  return isPayoutReviewFeeVisible(processingFee)
}

/** Noah global fiat: margin is in noah_rates.rate / you-send — never show a separate processing row. */
export function shouldShowGlobalPayoutProcessingFee(_input?: {
  processingFee?: number | null
}): boolean {
  return false
}

export function shouldShowPayoutReviewProcessingFee(input: {
  processingFee?: number | null
  executionModel?: WalletSendExecutionModel | string | null
  payoutFlow?: "global_fiat" | "wallet_send"
}): boolean {
  if (input.payoutFlow === "global_fiat") return false
  if (input.executionModel === "lifi_bridge") return false
  return shouldShowPayoutProcessingFee(input.processingFee)
}

export function shouldShowPayoutNetworkFee(networkFee: number | null | undefined): boolean {
  return isPayoutReviewFeeVisible(networkFee)
}

/** Wallet send: Solana gas is Turnkey-sponsored; LI.FI `networkFee` is not a user charge. */
export function shouldShowWalletSendNetworkFee(input: {
  executionModel?: WalletSendExecutionModel | string | null
  networkFee?: number | null
}): boolean {
  if (
    input.executionModel === "direct_turnkey" ||
    input.executionModel === "lifi_bridge"
  ) {
    return false
  }
  return shouldShowPayoutNetworkFee(input.networkFee)
}

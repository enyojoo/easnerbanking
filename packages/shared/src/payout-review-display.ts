import { isDirectTurnkeyWalletCorridor } from "./wallet-send-limits"
import { computeDisplayProcessingFee } from "./payout-processing-fee"

/** Hide positive dust at or below half a cent in USD/EUR. Exact $0 still shows. */
export const PAYOUT_REVIEW_FEE_VISIBLE_EPSILON = 0.005

export function isPayoutReviewFeeVisible(amount: number | null | undefined): boolean {
  if (amount == null || !Number.isFinite(amount)) return false
  if (amount === 0) return true
  return amount > PAYOUT_REVIEW_FEE_VISIBLE_EPSILON
}

/** First candidate that should appear as Processing fee, including an explicit $0. */
export function pickVisibleProcessingFee(
  ...candidates: Array<number | null | undefined>
): number | null {
  for (const amount of candidates) {
    if (isPayoutReviewFeeVisible(amount)) return Number(amount)
  }
  return null
}

function hasKnownFeePart(amount: number | null | undefined): boolean {
  return amount != null && Number.isFinite(amount)
}

function isPositiveFeeVisible(amount: number | null | undefined): boolean {
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

/** Hide FX rows for direct Turnkey USDC/EURC · Solana; Relay bridges still show rate when cross-asset. */
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

/**
 * Exchange fee is never shown as its own row — channel/route cost is folded into the
 * single "Processing fee" row via `computeDisplayProcessingFee`. Retained (always false)
 * so existing call sites compile; remove call sites over time.
 */
export function shouldShowPayoutExchangeFee(_input?: {
  sendCurrency?: string
  receiveCurrency?: string
  exchangeFee?: number | null
}): boolean {
  return false
}

/** Exchange rate row shows our (Easner) rate — cross-currency corridors only. */
export function shouldShowPayoutExchangeRate(input: {
  sendCurrency: string
  receiveCurrency: string
}): boolean {
  return hasPayoutCrossCurrencyFx(input.sendCurrency, input.receiveCurrency)
}

/** Combined display "Processing fee" (Easner bps leg + provider channel cost). */
export function shouldShowPayoutReviewFeeRow(input: {
  processingFee?: number | null
  exchangeFee?: number | null
}): boolean {
  if (!hasKnownFeePart(input.processingFee) && !hasKnownFeePart(input.exchangeFee)) {
    return false
  }
  return isPayoutReviewFeeVisible(computeDisplayProcessingFee(input))
}

export type WalletSendExecutionModel = "direct_turnkey" | "relay_bridge"

export function isBridgeWalletSendExecutionModel(model: string | null | undefined): boolean {
  return String(model || "").trim() === "relay_bridge"
}

/**
 * Show the combined "Processing fee" row (Easner bps leg + channel/route cost).
 * All rails including Relay bridge now surface an explicit fee.
 */
export function shouldShowWalletSendProcessingFee(input: {
  executionModel?: WalletSendExecutionModel | string | null
  processingFee?: number | null
  exchangeFee?: number | null
}): boolean {
  return shouldShowPayoutReviewFeeRow(input)
}

export function shouldShowPayoutProcessingFee(processingFee: number | null | undefined): boolean {
  return isPayoutReviewFeeVisible(processingFee)
}

/** Global fiat now shows an explicit Processing fee (Easner 1% + channel cost). */
export function shouldShowGlobalPayoutProcessingFee(input?: {
  processingFee?: number | null
  exchangeFee?: number | null
}): boolean {
  return shouldShowPayoutReviewFeeRow(input ?? {})
}

export function shouldShowPayoutReviewProcessingFee(input: {
  processingFee?: number | null
  exchangeFee?: number | null
  executionModel?: WalletSendExecutionModel | string | null
  payoutFlow?: "global_fiat" | "wallet_send"
}): boolean {
  return shouldShowPayoutReviewFeeRow(input)
}

export function shouldShowPayoutNetworkFee(networkFee: number | null | undefined): boolean {
  return isPositiveFeeVisible(networkFee)
}

/** Wallet send: Solana gas is Turnkey-sponsored; LI.FI `networkFee` is not a user charge. */
export function shouldShowWalletSendNetworkFee(input: {
  executionModel?: WalletSendExecutionModel | string | null
  networkFee?: number | null
}): boolean {
  if (
    input.executionModel === "direct_turnkey" ||
    isBridgeWalletSendExecutionModel(input.executionModel)
  ) {
    return false
  }
  return shouldShowPayoutNetworkFee(input.networkFee)
}

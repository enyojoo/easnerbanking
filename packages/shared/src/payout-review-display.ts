/** Hide fee rows at or below half a cent in USD/EUR (confirm + transaction details). */
export const PAYOUT_REVIEW_FEE_VISIBLE_EPSILON = 0.005

export function isPayoutReviewFeeVisible(amount: number | null | undefined): boolean {
  if (amount == null || !Number.isFinite(amount)) return false
  return amount > PAYOUT_REVIEW_FEE_VISIBLE_EPSILON
}

export function hasPayoutCrossCurrencyFx(sendCurrency: string, receiveCurrency: string): boolean {
  return (
    String(sendCurrency || "")
      .trim()
      .toUpperCase() !==
    String(receiveCurrency || "")
      .trim()
      .toUpperCase()
  )
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

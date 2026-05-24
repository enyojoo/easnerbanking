/**
 * Exchange fee implied in balance currency: Noah `cryptoAuthorizedAmount` (total debited)
 * minus amount-screen "you send" minus Easner processing fee — all in USD/EUR.
 */
export function computeBalancePayoutExchangeFee(
  totalDebited: number,
  youSendAmount: number,
  processingFeeAmount: number,
): number {
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) return 0
  const youSend = Number.isFinite(youSendAmount) ? youSendAmount : 0
  const processing = Number.isFinite(processingFeeAmount) ? processingFeeAmount : 0
  const raw = totalDebited - youSend - processing
  if (raw <= 0.000_01) return 0
  return Math.round(raw * 100) / 100
}

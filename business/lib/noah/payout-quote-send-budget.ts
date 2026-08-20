function normalizeReceiveForCurrency(currency: string, amount: number): number {
  const normalized = Math.round(amount * 100) / 100
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  const zeroDecimal = new Set(["NGN", "KES", "GHS", "UGX", "RWF", "XOF", "XAF"])
  if (zeroDecimal.has(currency.trim().toUpperCase())) return Math.round(normalized)
  return normalized
}

/** @deprecated Use normalizeGlobalPayoutQuoteReceiveAmount from @easner/shared – send/receive entry share one rate. */
export function seedQuoteReceiveForSendBudget(input: {
  sendBudget: number
  sourceCurrency: string
  receiveCurrency: string
  clientReceiveAmount: number
  dbRate?: number | null
}): number {
  const send = input.sourceCurrency.trim().toUpperCase()
  const receive = input.receiveCurrency.trim().toUpperCase()
  if (send === receive) {
    return normalizeReceiveForCurrency(receive, input.sendBudget)
  }
  const rate = input.dbRate
  if (rate != null && Number.isFinite(rate) && rate > 0) {
    return normalizeReceiveForCurrency(receive, input.sendBudget * rate)
  }
  return normalizeReceiveForCurrency(receive, input.clientReceiveAmount)
}

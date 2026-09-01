/**
 * Customer-facing copy for send-amount insufficient-funds states.
 * Never surface provider tokens like `insufficient_balance` in the UI.
 */

export function insufficientSourceBalanceCopy(sourceCurrency: string): string {
  const code = String(sourceCurrency || "USD").trim().toUpperCase() || "USD"
  return `Insufficient ${code} balance`
}

export function isInsufficientBalanceError(raw: unknown): boolean {
  if (raw == null) return false
  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>
    return (
      isInsufficientBalanceError(record.error) ||
      isInsufficientBalanceError(record.code) ||
      isInsufficientBalanceError(record.message)
    )
  }
  const s = String(raw).trim()
  if (!s) return false
  const token = s.replace(/[\s-]+/g, "_").toLowerCase()
  if (
    token === "insufficient_balance" ||
    token === "insufficient_onchain_balance" ||
    token === "insufficient_funds"
  ) {
    return true
  }
  return /insufficient(?:\s+[a-z]{3})?\s+balance/i.test(s)
}

export function insufficientSourceBalanceDetail(
  sourceCurrency: string,
  shortfall: number,
  formattedShortfall: string,
): string {
  const head = insufficientSourceBalanceCopy(sourceCurrency)
  if (!Number.isFinite(shortfall) || shortfall <= 0) return head
  return `${head}. You need ${formattedShortfall} more, or choose another source.`
}

/** Map API/quote errors to send-amount copy. Snake_case tokens are never shown raw. */
export function customerFacingSendAmountError(raw: unknown, sourceCurrency: string): string | null {
  if (raw == null) return null
  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>
    return (
      customerFacingSendAmountError(record.error, sourceCurrency) ||
      customerFacingSendAmountError(record.code, sourceCurrency) ||
      customerFacingSendAmountError(record.message, sourceCurrency)
    )
  }
  const s = String(raw).trim()
  if (!s) return null
  if (isInsufficientBalanceError(s)) return insufficientSourceBalanceCopy(sourceCurrency)
  if (/^[a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+$/.test(s)) return null
  return s
}

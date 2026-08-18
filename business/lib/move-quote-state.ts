export type MoveQuoteState = {
  sessionId: string
  direction: "usd_to_eur" | "eur_to_usd"
  sourceAmount: number
  destinationAmount: number
  rate: number
  processingFee: number
  totalDebited: number
  expiresAt: string
  quotedAt: number
}

const QUOTE_FRESH_BUFFER_MS = 10_000

export function isQuoteFresh(quote: MoveQuoteState | null | undefined): boolean {
  if (!quote?.expiresAt) return false
  return Date.now() < new Date(quote.expiresAt).getTime() - QUOTE_FRESH_BUFFER_MS
}

export function oppositeMoveDirection(
  direction: "usd_to_eur" | "eur_to_usd",
): "usd_to_eur" | "eur_to_usd" {
  return direction === "usd_to_eur" ? "eur_to_usd" : "usd_to_eur"
}

export function sourceCurrencyForDirection(direction: "usd_to_eur" | "eur_to_usd"): "USD" | "EUR" {
  return direction === "usd_to_eur" ? "USD" : "EUR"
}

export function destCurrencyForDirection(direction: "usd_to_eur" | "eur_to_usd"): "USD" | "EUR" {
  return direction === "usd_to_eur" ? "EUR" : "USD"
}

/** Effective FX rate from a move quote (destination per 1 source unit). */
export function resolveMoveQuoteRate(
  quote: Pick<MoveQuoteState, "sourceAmount" | "destinationAmount" | "rate"> | null | undefined,
): number {
  if (!quote) return 0
  if (Number.isFinite(quote.rate) && quote.rate > 0) return quote.rate
  if (quote.sourceAmount > 0 && quote.destinationAmount > 0) {
    return quote.destinationAmount / quote.sourceAmount
  }
  return 0
}

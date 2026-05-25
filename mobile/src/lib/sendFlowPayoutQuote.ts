import type { PayoutQuote } from './noahService'

/** Inline — avoid `@easner/shared` barrel (pulls flag assets into Metro on EAS). */
function payoutReceiveAmountsMatch(a: number, b: number): boolean {
  const norm = (n: number) => Math.round(n * 100) / 100
  return norm(a) === norm(b)
}

let stashed: PayoutQuote | null = null

export function stashSendPayoutQuote(quote: PayoutQuote): void {
  stashed = quote
}

export function peekSendPayoutQuote(): PayoutQuote | null {
  return stashed
}

export function clearSendPayoutQuote(): void {
  stashed = null
}

export function isStashedPayoutQuoteFresh(receiveAmount: number): boolean {
  if (!stashed?.expiresAt || !stashed.noah?.formSessionId) return false
  if (!payoutReceiveAmountsMatch(stashed.receiveAmount, receiveAmount)) return false
  return new Date(stashed.expiresAt).getTime() > Date.now()
}

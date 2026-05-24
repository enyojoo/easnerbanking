import type { PayoutQuote } from './noahService'

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
  if (stashed.receiveAmount !== receiveAmount) return false
  return new Date(stashed.expiresAt).getTime() > Date.now()
}

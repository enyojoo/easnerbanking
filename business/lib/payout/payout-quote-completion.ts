import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"

export function isCompleteLockedPayoutQuote(quote: PayoutQuoteResult | null | undefined): boolean {
  if (!quote?.expiresAt || !quote.easner?.providerRate) return false
  if (new Date(quote.expiresAt).getTime() <= Date.now()) return false
  if (quote.quotePhase === "preview") return false
  if (quote.quotePhase === "locked") {
    return Boolean(quote.lockId || quote.yc?.sendId || quote.settlement?.sessionId)
  }
  return Boolean(quote.settlement?.sessionId && quote.settlement.cryptoAuthorizedAmount)
}

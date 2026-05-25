import type { PayoutQuote } from './noahService'

/** Inline — avoid `@easner/shared` barrel (pulls flag assets into Metro on EAS). */
function normalizeReceiveForCurrency(currency: string, amount: number): number {
  const cur = currency.trim().toUpperCase()
  const normalized = Math.round(amount * 100) / 100
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  const zeroDecimal = new Set(['NGN', 'KES', 'GHS', 'UGX', 'RWF', 'XOF', 'XAF'])
  if (zeroDecimal.has(cur)) return Math.round(normalized)
  return normalized
}

function entryAmountsMatch(a: number, b: number, currency: string): boolean {
  return normalizeReceiveForCurrency(currency, a) === normalizeReceiveForCurrency(currency, b)
}

function sendEntryAmountsMatch(a: number, b: number): boolean {
  const norm = (n: number) => Math.round(n * 100) / 100
  return norm(a) === norm(b)
}

export type SendPayoutQuoteStashMeta = {
  amountEntryMode: 'send' | 'receive'
  /** Send-side principal when mode=send; receive fiat when mode=receive. */
  entryAmount: number
  receiveCurrency: string
}

let stashed: PayoutQuote | null = null
let stashedMeta: SendPayoutQuoteStashMeta | null = null

export function stashSendPayoutQuote(quote: PayoutQuote, meta: SendPayoutQuoteStashMeta): void {
  stashed = quote
  stashedMeta = meta
}

export function peekSendPayoutQuote(): PayoutQuote | null {
  return stashed
}

export function clearSendPayoutQuote(): void {
  stashed = null
  stashedMeta = null
}

export function isStashedPayoutQuoteFresh(input: SendPayoutQuoteStashMeta): boolean {
  if (!stashed?.expiresAt || !stashed.noah?.formSessionId || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  if (stashedMeta.amountEntryMode !== input.amountEntryMode) return false
  if (stashedMeta.receiveCurrency.trim().toUpperCase() !== input.receiveCurrency.trim().toUpperCase()) {
    return false
  }
  if (input.amountEntryMode === 'send') {
    return sendEntryAmountsMatch(stashedMeta.entryAmount, input.entryAmount)
  }
  return entryAmountsMatch(stashed.receiveAmount, input.entryAmount, input.receiveCurrency)
}

let inflightQuote: Promise<PayoutQuote | null> | null = null
let inflightQuoteKey = ''

/** Deduped quote fetch — used for background prefetch and Continue gate. */
export async function ensureSendPayoutQuoteStashed(
  fetchQuote: () => Promise<PayoutQuote>,
  meta: SendPayoutQuoteStashMeta,
): Promise<PayoutQuote | null> {
  if (isStashedPayoutQuoteFresh(meta)) return peekSendPayoutQuote()

  const key = [
    meta.amountEntryMode,
    meta.entryAmount,
    meta.receiveCurrency,
  ].join('|')
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  inflightQuote = fetchQuote()
    .then((quote) => {
      stashSendPayoutQuote(quote, meta)
      return quote
    })
    .catch(() => null)
    .finally(() => {
      inflightQuote = null
      inflightQuoteKey = ''
    })

  return inflightQuote
}

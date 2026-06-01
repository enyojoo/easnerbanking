import type { PayoutQuote } from './noahService'
import type { PayoutPrepareSession } from './payoutPrepareSession'

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
  recipientId: string
  amountEntryMode: 'send' | 'receive'
  /** Send-side principal when mode=send; receive fiat when mode=receive. */
  entryAmount: number
  receiveCurrency: string
}

let stashed: PayoutQuote | null = null
let stashedMeta: SendPayoutQuoteStashMeta | null = null
let lastPayoutQuoteError: string | null = null

export function isCompletePayoutQuote(quote: PayoutQuote | null | undefined): quote is PayoutQuote {
  return Boolean(
    quote?.expiresAt &&
      quote.noah?.formSessionId &&
      quote.noah.cryptoAuthorizedAmount &&
      quote.noah.cryptoCurrency &&
      quote.easner,
  )
}

export function stashSendPayoutQuote(quote: PayoutQuote, meta: SendPayoutQuoteStashMeta): void {
  if (!isCompletePayoutQuote(quote)) return
  stashed = quote
  stashedMeta = meta
  lastPayoutQuoteError = null
}

export function peekSendPayoutQuote(): PayoutQuote | null {
  return stashed
}

export function peekLastPayoutQuoteError(): string | null {
  return lastPayoutQuoteError
}

export function clearSendPayoutQuote(): void {
  stashed = null
  stashedMeta = null
  lastPayoutQuoteError = null
}

export function isStashedPayoutQuoteFresh(input: SendPayoutQuoteStashMeta): boolean {
  if (!isCompletePayoutQuote(stashed) || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  if (stashedMeta.recipientId.trim() !== input.recipientId.trim()) return false
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
    meta.recipientId,
    meta.amountEntryMode,
    meta.entryAmount,
    meta.receiveCurrency,
  ].join('|')
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastPayoutQuoteError = null
  inflightQuote = fetchQuote()
    .then((quote) => {
      if (!isCompletePayoutQuote(quote)) {
        lastPayoutQuoteError = 'Incomplete payout quote response.'
        return null
      }
      stashSendPayoutQuote(quote, meta)
      return quote
    })
    .catch((err) => {
      lastPayoutQuoteError = err instanceof Error ? err.message : 'quote_failed'
      return null
    })
    .finally(() => {
      inflightQuote = null
      inflightQuoteKey = ''
    })

  return inflightQuote
}

export function payoutPrepareSessionFromQuote(
  quote: PayoutQuote,
  recipientId: string,
): PayoutPrepareSession | undefined {
  if (!isCompletePayoutQuote(quote)) return undefined
  return {
    recipientId,
    formSessionId: quote.noah.formSessionId,
    cryptoAuthorizedAmount: quote.noah.cryptoAuthorizedAmount,
    cryptoCurrency: quote.noah.cryptoCurrency,
    ...(quote.channelId ? { channelId: quote.channelId } : {}),
    noahFloor: quote.noah.noahFloor,
    noahSendAmount: quote.noah.noahSendAmount,
    totalDebited: String(quote.totalDebited),
    marginAmount: String(quote.marginAmount),
    ...(quote.noah.marginCaptureMode ? { marginCaptureMode: quote.noah.marginCaptureMode } : {}),
    ...(quote.noah.rate != null ? { customerRate: quote.noah.rate } : {}),
    ...(quote.noah.noahMid != null ? { noahMid: quote.noah.noahMid } : {}),
  }
}

export function payoutDisplayAmountsFromQuote(quote: PayoutQuote): {
  youSendAmount: number
  exchangeFee: number
  marginAmount: number
  totalDebited: number
  customerRate: number
} {
  return {
    youSendAmount: quote.customerPrincipal,
    exchangeFee: quote.channelCost,
    marginAmount: quote.marginAmount,
    totalDebited: quote.totalDebited,
    customerRate: quote.noah?.rate ?? quote.easner?.providerRate ?? 0,
  }
}

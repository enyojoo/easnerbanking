import { apiFetch } from '../query/api-client'
import type { YcPayInRail } from '../hooks/useYcCrossBorderFlow'

export type YcFundBalanceQuote = {
  ok: true
  sequenceId: string
  localPayIn: number
  usdCredit: number
  customerRate: number
  processingFee?: number
  ycChannelFeeUsd?: number
  displayProcessingFee?: number
  bankInfo: Record<string, unknown> | null
  expiresAt: string
  transactionId: string | null
  easnerTransactionId?: string | null
  transferId: string | null
  payInNotice?: string
}

/** User-entered amount anchor — solved pay-in/credit from YC may differ from preview. */
export type FundBalanceQuoteStashMeta = {
  country: string
  currency: string
  rail: YcPayInRail
  amountEntryMode: 'usd' | 'local'
  enteredAmount: number
}

let stashed: YcFundBalanceQuote | null = null
let stashedMeta: FundBalanceQuoteStashMeta | null = null
let lastQuoteError: string | null = null
let inflightQuote: Promise<YcFundBalanceQuote | null> | null = null
let inflightQuoteKey = ''

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function entryAmountsMatch(a: number, b: number): boolean {
  return roundMoney(a) === roundMoney(b)
}

export function isCompleteFundBalanceQuote(
  quote: YcFundBalanceQuote | null | undefined,
): quote is YcFundBalanceQuote {
  return Boolean(
    quote?.ok &&
      quote.transferId &&
      quote.expiresAt &&
      quote.localPayIn > 0 &&
      quote.usdCredit > 0 &&
      quote.customerRate > 0,
  )
}

export function stashFundBalanceQuote(quote: YcFundBalanceQuote, meta: FundBalanceQuoteStashMeta): void {
  if (!isCompleteFundBalanceQuote(quote)) return
  stashed = quote
  stashedMeta = meta
  lastQuoteError = null
}

export function peekFundBalanceQuote(): YcFundBalanceQuote | null {
  return stashed
}

export function peekLastFundBalanceQuoteError(): string | null {
  return lastQuoteError
}

export function clearFundBalanceQuote(): void {
  stashed = null
  stashedMeta = null
  lastQuoteError = null
}

export function isStashedFundBalanceQuoteFresh(meta: FundBalanceQuoteStashMeta): boolean {
  if (!isCompleteFundBalanceQuote(stashed) || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  if (stashedMeta.country.trim().toUpperCase() !== meta.country.trim().toUpperCase()) return false
  if (stashedMeta.currency.trim().toUpperCase() !== meta.currency.trim().toUpperCase()) return false
  if (stashedMeta.rail !== meta.rail) return false
  if (stashedMeta.amountEntryMode !== meta.amountEntryMode) return false
  return entryAmountsMatch(stashedMeta.enteredAmount, meta.enteredAmount)
}

export async function fetchFundBalanceQuote(meta: FundBalanceQuoteStashMeta): Promise<YcFundBalanceQuote> {
  const body: Record<string, unknown> = {
    currency: meta.currency,
    country: meta.country,
    rail: meta.rail,
  }
  if (meta.amountEntryMode === 'usd' && meta.enteredAmount > 0) {
    body.usdCredit = meta.enteredAmount
  } else if (meta.enteredAmount > 0) {
    body.localPayIn = meta.enteredAmount
  } else {
    throw new Error('Enter a valid amount')
  }
  const data = await apiFetch<YcFundBalanceQuote, Record<string, unknown>>(
    '/api/yellowcard/fund-balance/quote',
    { method: 'POST', body },
  )
  if (!data.ok) throw new Error('Fund balance quote failed')
  return data
}

/** Deduped quote fetch — background prefetch and Continue/review gate. */
export async function ensureFundBalanceQuoteStashed(
  meta: FundBalanceQuoteStashMeta,
): Promise<YcFundBalanceQuote | null> {
  if (isStashedFundBalanceQuoteFresh(meta)) return peekFundBalanceQuote()

  const key = [
    meta.country,
    meta.currency,
    meta.rail,
    meta.amountEntryMode,
    meta.enteredAmount,
  ].join('|')
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastQuoteError = null
  inflightQuote = fetchFundBalanceQuote(meta)
    .then((quote) => {
      if (!isCompleteFundBalanceQuote(quote)) {
        lastQuoteError = 'Incomplete fund balance quote response.'
        return null
      }
      stashFundBalanceQuote(quote, meta)
      return quote
    })
    .catch((err) => {
      lastQuoteError = err instanceof Error ? err.message : 'quote_failed'
      return null
    })
    .finally(() => {
      inflightQuote = null
      inflightQuoteKey = ''
    })

  return inflightQuote
}

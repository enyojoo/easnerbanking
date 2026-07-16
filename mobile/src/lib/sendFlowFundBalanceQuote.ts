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

export type FundBalanceQuoteStashMeta = {
  country: string
  currency: string
  rail: YcPayInRail
  amountEntryMode: 'usd' | 'local'
  usdCredit: number
  localPayIn: number
}

let stashed: YcFundBalanceQuote | null = null
let stashedMeta: FundBalanceQuoteStashMeta | null = null
let lastQuoteError: string | null = null
let inflightQuote: Promise<YcFundBalanceQuote | null> | null = null
let inflightQuoteKey = ''

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function amountsMatch(a: number, b: number): boolean {
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
  if (!amountsMatch(stashedMeta.usdCredit, meta.usdCredit)) return false
  if (!amountsMatch(stashedMeta.localPayIn, meta.localPayIn)) return false
  return true
}

export async function fetchFundBalanceQuote(input: {
  country: string
  currency: string
  rail: YcPayInRail
  amountEntryMode: 'usd' | 'local'
  usdCredit: number
  localPayIn: number
}): Promise<YcFundBalanceQuote> {
  const body: Record<string, unknown> = {
    currency: input.currency,
    country: input.country,
    rail: input.rail,
  }
  if (input.amountEntryMode === 'usd' && input.usdCredit > 0) {
    body.usdCredit = input.usdCredit
  } else if (input.localPayIn > 0) {
    body.localPayIn = input.localPayIn
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
    meta.usdCredit,
    meta.localPayIn,
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

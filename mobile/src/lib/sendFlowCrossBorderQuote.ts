import { apiFetch, ApiError } from '../query/api-client'
import { normalizeYcMomoPhone } from '@easner/shared'
import type { YcPayInRail, YcCrossBorderQuoteResult } from '../hooks/useYcCrossBorderFlow'

export type CrossBorderQuoteStashMeta = {
  recipientId: string
  payInCurrency: string
  payInCountry: string
  payInRail: YcPayInRail
  receiveAmount: number
  sourcePhone?: string
  networkId?: string
  sourceNetworkName?: string
}

let stashed: YcCrossBorderQuoteResult | null = null
let stashedMeta: CrossBorderQuoteStashMeta | null = null
let lastQuoteError: string | null = null
let inflightQuote: Promise<YcCrossBorderQuoteResult | null> | null = null
let inflightQuoteKey = ''

export function quoteMetaKey(meta: CrossBorderQuoteStashMeta): string {
  return [
    meta.recipientId,
    meta.payInCurrency,
    meta.payInCountry,
    meta.payInRail,
    meta.receiveAmount,
    meta.sourcePhone ?? '',
    meta.networkId ?? '',
  ].join('|')
}

export function isCompleteCrossBorderQuote(
  quote: YcCrossBorderQuoteResult | null | undefined,
): quote is YcCrossBorderQuoteResult {
  return Boolean(
    quote?.ok &&
      quote.transferId &&
      quote.expiresAt &&
      quote.localPayIn > 0 &&
      quote.customerRate > 0,
  )
}

export function stashCrossBorderQuote(
  quote: YcCrossBorderQuoteResult,
  meta: CrossBorderQuoteStashMeta,
): void {
  if (!isCompleteCrossBorderQuote(quote)) return
  stashed = quote
  stashedMeta = meta
  lastQuoteError = null
}

export function peekCrossBorderQuote(): YcCrossBorderQuoteResult | null {
  return stashed
}

export function peekLastCrossBorderQuoteError(): string | null {
  return lastQuoteError
}

export function clearCrossBorderQuote(): void {
  stashed = null
  stashedMeta = null
  lastQuoteError = null
}

export function isStashedCrossBorderQuoteFresh(meta: CrossBorderQuoteStashMeta): boolean {
  if (!isCompleteCrossBorderQuote(stashed) || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  return quoteMetaKey(stashedMeta) === quoteMetaKey(meta)
}

function buildCrossBorderQuoteBody(meta: CrossBorderQuoteStashMeta): Record<string, unknown> {
  if (!meta.recipientId?.trim()) throw new Error('Recipient is required')
  if (!meta.payInCurrency?.trim() || !meta.payInCountry?.trim()) {
    throw new Error('Pay-in country could not be resolved')
  }
  if (!(meta.receiveAmount > 0)) throw new Error('Enter a valid amount')

  const body: Record<string, unknown> = {
    recipientId: meta.recipientId.trim(),
    receiveAmount: meta.receiveAmount,
    payInCurrency: meta.payInCurrency.trim().toUpperCase(),
    payInCountry: meta.payInCountry.trim().toUpperCase(),
    payInRail: meta.payInRail,
  }

  if (meta.payInRail === 'mobile_money') {
    if (!meta.sourcePhone?.trim() || !meta.networkId?.trim()) {
      throw new Error('Mobile number and network are required')
    }
    body.sourcePhone = normalizeYcMomoPhone(meta.sourcePhone.trim(), meta.payInCountry)
    body.networkId = meta.networkId.trim()
    if (meta.sourceNetworkName) body.sourceNetworkName = meta.sourceNetworkName
  }

  return body
}

export async function fetchCrossBorderQuote(
  meta: CrossBorderQuoteStashMeta,
): Promise<YcCrossBorderQuoteResult> {
  const data = await apiFetch<YcCrossBorderQuoteResult, Record<string, unknown>>(
    '/api/yellowcard/cross-border/quote',
    { method: 'POST', body: buildCrossBorderQuoteBody(meta) },
  )
  if (!data.ok) throw new Error('Cross-border quote failed')
  return data
}

/** Deduped quote fetch — bank prefetch, MoMo quote-on-continue, review gate. */
export async function ensureCrossBorderQuoteStashed(
  meta: CrossBorderQuoteStashMeta,
): Promise<YcCrossBorderQuoteResult | null> {
  if (isStashedCrossBorderQuoteFresh(meta)) return peekCrossBorderQuote()

  const key = quoteMetaKey(meta)
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastQuoteError = null
  inflightQuote = fetchCrossBorderQuote(meta)
    .then((quote) => {
      if (!isCompleteCrossBorderQuote(quote)) {
        lastQuoteError = 'Incomplete cross-border quote response.'
        return null
      }
      stashCrossBorderQuote(quote, meta)
      return quote
    })
    .catch((err) => {
      lastQuoteError =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'quote_failed'
      return null
    })
    .finally(() => {
      inflightQuote = null
      inflightQuoteKey = ''
    })

  return inflightQuote
}

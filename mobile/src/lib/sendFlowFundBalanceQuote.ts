import { apiFetch, ApiError } from '../query/api-client'
import { ycFundBalanceQuoteErrorMessage, normalizeYcMomoPhone } from '@easner/shared'
import type { YcPayInRail } from '../hooks/useYcCrossBorderFlow'

export type YcFundBalanceQuote = {
  ok: true
  quotePhase?: "preview" | "locked"
  quoteKey?: string
  requiresConfirm?: boolean
  sequenceId?: string
  localPayIn: number
  usdCredit: number
  customerRate: number
  processingFee?: number
  ycChannelFeeUsd?: number
  ycLegFeesUsd?: number
  displayProcessingFee?: number
  displayProcessingFeeLocal?: number
  displayProcessingFeeCurrency?: string
  provisionalPayIn?: number
  creditOrReceiveAmount?: number
  bankInfo?: Record<string, unknown> | null
  expiresAt: string
  transactionId: string | null
  easnerTransactionId?: string | null
  transferId: string | null
  payInNotice?: string
  payInRail?: YcPayInRail
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
}

/** User-entered amount anchor — solved pay-in/credit from YC may differ from preview. */
export type FundBalanceQuoteStashMeta = {
  country: string
  currency: string
  rail: YcPayInRail
  amountEntryMode: 'usd' | 'local'
  enteredAmount: number
  sourcePhone?: string
  networkId?: string
  sourceNetworkName?: string
}

let stashed: YcFundBalanceQuote | null = null
let stashedMeta: FundBalanceQuoteStashMeta | null = null
let lastQuoteError: string | null = null
let inflightQuote: Promise<YcFundBalanceQuote | null> | null = null
let inflightQuoteKey = ''
let inflightConfirm: Promise<YcFundBalanceQuote | null> | null = null
let inflightConfirmKey = ''

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function entryAmountsMatch(a: number, b: number): boolean {
  return roundMoney(a) === roundMoney(b)
}

function quoteMetaKey(meta: FundBalanceQuoteStashMeta): string {
  return [
    meta.country,
    meta.currency,
    meta.rail,
    meta.amountEntryMode,
    meta.enteredAmount,
    meta.sourcePhone ?? '',
    meta.networkId ?? '',
  ].join('|')
}

/** Preview quote from `/quote` — enough for review and Continue. */
export function isUsableFundBalanceQuotePreview(
  quote: YcFundBalanceQuote | null | undefined,
): quote is YcFundBalanceQuote {
  return Boolean(
    quote?.ok &&
      quote.expiresAt &&
      quote.localPayIn > 0 &&
      quote.usdCredit > 0 &&
      quote.customerRate > 0,
  )
}

/** Locked order from `/confirm` — required before pay-in instructions finalize. */
export function isCompleteFundBalanceQuote(
  quote: YcFundBalanceQuote | null | undefined,
): quote is YcFundBalanceQuote {
  return Boolean(isUsableFundBalanceQuotePreview(quote) && quote.transferId)
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
  if (!isUsableFundBalanceQuotePreview(stashed) || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  return quoteMetaKey(stashedMeta) === quoteMetaKey(meta)
}

function buildFundBalanceAmountBody(meta: FundBalanceQuoteStashMeta): Record<string, unknown> {
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
  if (meta.rail === 'mobile_money') {
    if (!meta.sourcePhone?.trim() || !meta.networkId?.trim()) {
      throw new Error('Mobile number and network are required')
    }
    body.sourcePhone = normalizeYcMomoPhone(meta.sourcePhone.trim(), meta.country)
    body.networkId = meta.networkId.trim()
    if (meta.sourceNetworkName) body.sourceNetworkName = meta.sourceNetworkName
  }
  return body
}

export async function fetchFundBalanceQuotePreview(meta: FundBalanceQuoteStashMeta): Promise<YcFundBalanceQuote> {
  const data = await apiFetch<YcFundBalanceQuote, Record<string, unknown>>(
    '/api/yellowcard/fund-balance/quote',
    { method: 'POST', body: buildFundBalanceAmountBody(meta) },
  )
  if (!data.ok) throw new Error('Fund balance quote failed')
  return data
}

export async function confirmFundBalanceOrder(meta: FundBalanceQuoteStashMeta): Promise<YcFundBalanceQuote> {
  const data = await apiFetch<YcFundBalanceQuote, Record<string, unknown>>(
    '/api/yellowcard/fund-balance/confirm',
    { method: 'POST', body: buildFundBalanceAmountBody(meta) },
  )
  if (!data.ok || !data.transferId) throw new Error('Fund balance confirm failed')
  return data
}

/** @deprecated Use fetchFundBalanceQuotePreview */
export async function fetchFundBalanceQuote(meta: FundBalanceQuoteStashMeta): Promise<YcFundBalanceQuote> {
  return fetchFundBalanceQuotePreview(meta)
}

/** Deduped quote fetch — background prefetch and Continue/review gate. */
export async function ensureFundBalanceQuoteStashed(
  meta: FundBalanceQuoteStashMeta,
): Promise<YcFundBalanceQuote | null> {
  if (isStashedFundBalanceQuoteFresh(meta)) return peekFundBalanceQuote()

  const key = quoteMetaKey(meta)
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastQuoteError = null
  inflightQuote = fetchFundBalanceQuotePreview(meta)
    .then((quote) => {
      if (!quote?.ok || !(quote.localPayIn > 0) || !(quote.usdCredit > 0)) {
        lastQuoteError = 'Incomplete fund balance quote response.'
        return null
      }
      stashed = quote
      stashedMeta = meta
      lastQuoteError = null
      return quote
    })
    .catch((err) => {
      lastQuoteError =
        err instanceof ApiError
          ? ycFundBalanceQuoteErrorMessage(err.code ?? undefined, err.message)
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

export async function ensureFundBalanceOrderConfirmed(
  meta: FundBalanceQuoteStashMeta,
): Promise<YcFundBalanceQuote | null> {
  if (isStashedFundBalanceQuoteFresh(meta) && isCompleteFundBalanceQuote(stashed)) {
    return stashed
  }

  const key = quoteMetaKey(meta)
  if (inflightConfirm && inflightConfirmKey === key) return inflightConfirm

  inflightConfirmKey = key
  lastQuoteError = null
  inflightConfirm = confirmFundBalanceOrder(meta)
    .then((quote) => {
      if (!isCompleteFundBalanceQuote(quote)) {
        lastQuoteError = 'Incomplete fund balance confirm response.'
        return null
      }
      stashFundBalanceQuote(quote, meta)
      return quote
    })
    .catch((err) => {
      lastQuoteError =
        err instanceof ApiError
          ? ycFundBalanceQuoteErrorMessage(err.code ?? undefined, err.message)
          : err instanceof Error
            ? err.message
            : 'confirm_failed'
      return null
    })
    .finally(() => {
      inflightConfirm = null
      inflightConfirmKey = ''
    })

  return inflightConfirm
}

export type PayInNetworkRow = { id: string; name: string }

const PAY_IN_NETWORKS_CACHE_TTL_MS = 5 * 60_000
const payInNetworksCache = new Map<string, { networks: PayInNetworkRow[]; at: number }>()
const payInNetworksInflight = new Map<string, Promise<PayInNetworkRow[]>>()

export function payInNetworksCacheKey(country: string, currency: string): string {
  return `${country.trim().toUpperCase()}:${currency.trim().toUpperCase()}`
}

export function seedCachedPayInNetworks(
  country: string,
  currency: string,
  networks: PayInNetworkRow[],
): void {
  const cc = country.trim().toUpperCase()
  const cur = currency.trim().toUpperCase()
  if (!cc || !cur) return
  payInNetworksCache.set(payInNetworksCacheKey(cc, cur), { networks, at: Date.now() })
}

/** Returns cached networks, or null when nothing is cached yet. */
export function readCachedPayInNetworks(
  country: string,
  currency: string,
): PayInNetworkRow[] | null {
  const cc = country.trim().toUpperCase()
  const cur = currency.trim().toUpperCase()
  if (!cc || !cur) return null

  const key = payInNetworksCacheKey(cc, cur)
  const hit = payInNetworksCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > PAY_IN_NETWORKS_CACHE_TTL_MS) {
    payInNetworksCache.delete(key)
    return null
  }
  return hit.networks
}

async function loadPayInNetworks(country: string, currency: string): Promise<PayInNetworkRow[]> {
  const cc = country.trim().toUpperCase()
  const cur = currency.trim().toUpperCase()

  try {
    const data = await apiFetch<{ networks?: PayInNetworkRow[] }>(
      '/api/yellowcard/pay-in-networks',
      { query: { country: cc, currency: cur } },
    )
    return data.networks ?? []
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e
  }

  const rails = await apiFetch<{
    momoNetworks?: PayInNetworkRow[]
    networks?: PayInNetworkRow[]
  }>('/api/yellowcard/receive-rails', { query: { country: cc, currency: cur } })
  return rails.momoNetworks ?? rails.networks ?? []
}

/** Idempotent prefetch — dedupes in-flight requests and writes cache on success. */
export async function ensurePayInNetworksCached(
  country: string,
  currency: string,
): Promise<PayInNetworkRow[]> {
  const cc = country.trim().toUpperCase()
  const cur = currency.trim().toUpperCase()
  if (!cc || !cur) return []

  const cached = readCachedPayInNetworks(cc, cur)
  if (cached) return cached

  const key = payInNetworksCacheKey(cc, cur)
  const inflight = payInNetworksInflight.get(key)
  if (inflight) return inflight

  const task = loadPayInNetworks(cc, cur)
    .then((networks) => {
      seedCachedPayInNetworks(cc, cur, networks)
      return networks
    })
    .finally(() => {
      payInNetworksInflight.delete(key)
    })

  payInNetworksInflight.set(key, task)
  return task
}

export async function fetchPayInNetworks(
  country: string,
  currency: string,
): Promise<PayInNetworkRow[]> {
  return ensurePayInNetworksCached(country, currency)
}

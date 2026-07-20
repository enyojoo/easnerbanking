import {
  mapResidenceToLocalPayInCurrency,
  resolveNgLocalVerification,
  YC_PAY_IN_RATES_DESTINATION,
  type NgLocalIdType,
  type YcRateClientRow,
} from '@easner/shared'
import { apiFetch } from '../query/api-client'
import { isTier1Complete } from './compliance'
import { ensurePayInNetworksCached, seedCachedPayInNetworks } from './sendFlowFundBalanceQuote'

export type YcReceiveRailsResponse = {
  ok: boolean
  country: string
  currency: string
  rails: {
    bank_transfer: {
      available: boolean
      minLocalPayIn?: number | null
      maxLocalPayIn?: number | null
    }
    mobile_money: {
      available: boolean
      minLocalPayIn?: number | null
      maxLocalPayIn?: number | null
    }
  }
  anyAvailable: boolean
  /** Present when mobile_money pay-in is available (also on receive-rails for older clients). */
  momoNetworks?: { id: string; name: string }[]
}

const RECEIVE_RAILS_CACHE_TTL_MS = 5 * 60_000
const PAY_IN_RATES_CACHE_TTL_MS = 2 * 60_000
const NG_VERIFY_CACHE_TTL_MS = 5 * 60_000

const receiveRailsCache = new Map<string, { data: YcReceiveRailsResponse; at: number }>()
let payInRatesCache: { rates: YcRateClientRow[]; at: number } | null = null
const ngVerifyCache = new Map<string, { missingType: NgLocalIdType | null; at: number }>()

const receiveRailsInflight = new Map<string, Promise<YcReceiveRailsResponse | null>>()
let payInRatesInflight: Promise<YcRateClientRow[] | null> | null = null
const ngVerifyInflight = new Map<string, Promise<NgLocalIdType | null>>()

export function receiveRailsCacheKey(country: string, currency: string): string {
  return `${country.trim().toUpperCase()}:${currency.trim().toUpperCase()}`
}

export function readCachedReceiveRails(
  country: string,
  currency: string,
): YcReceiveRailsResponse | null {
  const key = receiveRailsCacheKey(country, currency)
  const hit = receiveRailsCache.get(key)
  return hit?.data ?? null
}

export function isReceiveRailsCacheFresh(country: string, currency: string): boolean {
  const key = receiveRailsCacheKey(country, currency)
  const hit = receiveRailsCache.get(key)
  if (!hit) return false
  return Date.now() - hit.at <= RECEIVE_RAILS_CACHE_TTL_MS
}

function writeReceiveRailsCache(
  country: string,
  currency: string,
  data: YcReceiveRailsResponse,
): void {
  receiveRailsCache.set(receiveRailsCacheKey(country, currency), { data, at: Date.now() })
}

export function readCachedYcPayInRates(): YcRateClientRow[] | null {
  return payInRatesCache?.rates ?? null
}

export function isYcPayInRatesCacheFresh(): boolean {
  if (!payInRatesCache) return false
  return Date.now() - payInRatesCache.at <= PAY_IN_RATES_CACHE_TTL_MS
}

function writeYcPayInRatesCache(rates: YcRateClientRow[]): void {
  payInRatesCache = { rates, at: Date.now() }
}

export function readCachedNgLocalMissingType(residenceCountry: string): NgLocalIdType | null | undefined {
  const key = residenceCountry.trim().toUpperCase()
  if (!key) return undefined
  const hit = ngVerifyCache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > NG_VERIFY_CACHE_TTL_MS) {
    ngVerifyCache.delete(key)
    return undefined
  }
  return hit.missingType
}

export async function prefetchYcReceiveRails(
  country: string,
  currency: string,
): Promise<YcReceiveRailsResponse | null> {
  const cc = country.trim().toUpperCase()
  const cur = currency.trim().toUpperCase()
  if (!cc || !cur) return null

  const cached = readCachedReceiveRails(cc, cur)
  if (cached && isReceiveRailsCacheFresh(cc, cur)) return cached

  const key = receiveRailsCacheKey(cc, cur)
  const inflight = receiveRailsInflight.get(key)
  if (inflight) return inflight

  const task = (async () => {
    try {
      const data = await apiFetch<YcReceiveRailsResponse>('/api/yellowcard/receive-rails', {
        query: { country: cc, currency: cur },
      })
      writeReceiveRailsCache(cc, cur, data)
      return data
    } catch {
      return readCachedReceiveRails(cc, cur)
    } finally {
      receiveRailsInflight.delete(key)
    }
  })()

  receiveRailsInflight.set(key, task)
  return task
}

export async function prefetchYcPayInRates(): Promise<YcRateClientRow[] | null> {
  const cached = readCachedYcPayInRates()
  if (cached && isYcPayInRatesCacheFresh()) return cached

  if (payInRatesInflight) return payInRatesInflight

  payInRatesInflight = (async () => {
    try {
      const data = await apiFetch<{ rates?: YcRateClientRow[] }>('/api/fx/yc-rates', {
        query: { destinations: YC_PAY_IN_RATES_DESTINATION },
      })
      const rates = data.rates ?? []
      writeYcPayInRatesCache(rates)
      return rates
    } catch {
      return readCachedYcPayInRates()
    } finally {
      payInRatesInflight = null
    }
  })()

  return payInRatesInflight
}

export async function prefetchNgLocalVerification(
  residenceCountry: string,
): Promise<NgLocalIdType | null> {
  const cc = residenceCountry.trim().toUpperCase()
  if (!cc) return null

  const cached = readCachedNgLocalMissingType(cc)
  if (cached !== undefined) return cached

  const inflight = ngVerifyInflight.get(cc)
  if (inflight) return inflight

  const task = (async () => {
    try {
      const data = await apiFetch<{
        residenceCountry?: string | null
        kycIdType?: string | null
        kycIdNumber?: string | null
        ngLocalIdType?: string | null
        ngLocalIdNumber?: string | null
      }>('/api/compliance/ng-local-verification')
      const state = resolveNgLocalVerification({
        residenceCountry: data.residenceCountry ?? cc,
        kycIdType: data.kycIdType,
        kycIdNumber: data.kycIdNumber,
        ngLocalIdType: data.ngLocalIdType,
        ngLocalIdNumber: data.ngLocalIdNumber,
      })
      ngVerifyCache.set(cc, { missingType: state.missingType, at: Date.now() })
      return state.missingType
    } catch {
      return null
    } finally {
      ngVerifyInflight.delete(cc)
    }
  })()

  ngVerifyInflight.set(cc, task)
  return task
}

export type WarmYcLocalDepositInput = {
  residenceCountry?: string | null
  localPayInCurrency?: string | null
  kycApproved?: boolean
}

export function resolveWarmYcLocalDepositCorridor(
  profile: { residence_country?: string | null } | null | undefined,
  opts?: { kycApproved?: boolean },
): WarmYcLocalDepositInput | null {
  const country = String(profile?.residence_country ?? '').trim().toUpperCase()
  const currency = country ? mapResidenceToLocalPayInCurrency(country) : null
  const kycApproved = opts?.kycApproved ?? isTier1Complete(profile)
  if (!kycApproved || !country || !currency) return null
  return { residenceCountry: country, localPayInCurrency: currency, kycApproved: true }
}

/** Idempotent warmup for Receive → Local deposit (rails, pay-in rates, NG KYC gate). */
export async function warmYcLocalDepositCaches(input: WarmYcLocalDepositInput): Promise<void> {
  const country = String(input.residenceCountry ?? '').trim().toUpperCase()
  const currency = String(input.localPayInCurrency ?? '').trim().toUpperCase()
  if (!input.kycApproved || !country || !currency) return

  const tasks: Promise<unknown>[] = [
    prefetchYcReceiveRails(country, currency).then((rails) => {
      if (!rails?.rails.mobile_money.available) return rails
      if (rails.momoNetworks?.length) {
        seedCachedPayInNetworks(country, currency, rails.momoNetworks)
        return rails
      }
      return ensurePayInNetworksCached(country, currency).then(() => rails)
    }),
    prefetchYcPayInRates(),
  ]
  if (currency === 'NGN') {
    tasks.push(prefetchNgLocalVerification(country))
  }
  await Promise.allSettled(tasks)
}

/** Awaitable warmup — call before Receive / Send local-currency UI so rows appear together. */
export async function ensureYcLocalDepositCachesReady(
  input: WarmYcLocalDepositInput | null | undefined,
): Promise<void> {
  if (!input) return
  await warmYcLocalDepositCaches(input)
}

/** Warm pay-in corridor when country + currency are known (send cross-border picker). */
export async function warmYcPayInCorridor(
  country: string | null | undefined,
  currency: string | null | undefined,
): Promise<void> {
  const cc = String(country ?? '').trim().toUpperCase()
  const cur = String(currency ?? '').trim().toUpperCase()
  if (!cc || !cur) return
  await warmYcLocalDepositCaches({
    residenceCountry: cc,
    localPayInCurrency: cur,
    kycApproved: true,
  })
}

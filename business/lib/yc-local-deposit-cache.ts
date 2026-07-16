import {
  YC_PAY_IN_RATES_DESTINATION,
  type YcRateClientRow,
} from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"

export type ReceiveRailsResponse = {
  ok: boolean
  country?: string
  currency?: string
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
  momoNetworks?: { id: string; name: string }[]
}

const RECEIVE_RAILS_CACHE_TTL_MS = 5 * 60_000
const PAY_IN_RATES_CACHE_TTL_MS = 2 * 60_000

const receiveRailsCache = new Map<string, { data: ReceiveRailsResponse; at: number }>()
let payInRatesCache: { rates: YcRateClientRow[]; at: number } | null = null

const receiveRailsInflight = new Map<string, Promise<ReceiveRailsResponse | null>>()
let payInRatesInflight: Promise<YcRateClientRow[] | null> | null = null

export function receiveRailsCacheKey(country: string, currency: string): string {
  return `${country.trim().toUpperCase()}:${currency.trim().toUpperCase()}`
}

export function readCachedReceiveRails(
  country: string,
  currency: string,
): ReceiveRailsResponse | null {
  const key = receiveRailsCacheKey(country, currency)
  const hit = receiveRailsCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > RECEIVE_RAILS_CACHE_TTL_MS) {
    receiveRailsCache.delete(key)
    return null
  }
  return hit.data
}

function writeReceiveRailsCache(
  country: string,
  currency: string,
  data: ReceiveRailsResponse,
): void {
  receiveRailsCache.set(receiveRailsCacheKey(country, currency), { data, at: Date.now() })
}

export function readCachedYcPayInRates(): YcRateClientRow[] | null {
  if (!payInRatesCache) return null
  if (Date.now() - payInRatesCache.at > PAY_IN_RATES_CACHE_TTL_MS) {
    payInRatesCache = null
    return null
  }
  return payInRatesCache.rates
}

function writeYcPayInRatesCache(rates: YcRateClientRow[]): void {
  payInRatesCache = { rates, at: Date.now() }
}

export async function prefetchYcReceiveRails(
  country: string,
  currency: string,
): Promise<ReceiveRailsResponse | null> {
  const cc = country.trim().toUpperCase()
  const cur = currency.trim().toUpperCase()
  if (!cc || !cur) return null

  const cached = readCachedReceiveRails(cc, cur)
  if (cached) return cached

  const key = receiveRailsCacheKey(cc, cur)
  const inflight = receiveRailsInflight.get(key)
  if (inflight) return inflight

  const task = (async () => {
    try {
      const res = await fetchWithSession(
        `/api/yellowcard/receive-rails?country=${encodeURIComponent(cc)}&currency=${encodeURIComponent(cur)}`,
      )
      const data = (await res.json().catch(() => ({}))) as ReceiveRailsResponse
      if (res.ok) {
        writeReceiveRailsCache(cc, cur, data)
        return data
      }
      return null
    } catch {
      return null
    } finally {
      receiveRailsInflight.delete(key)
    }
  })()

  receiveRailsInflight.set(key, task)
  return task
}

/** MoMo networks for pay-in review — falls back to receive-rails when pay-in-networks is absent. */
export async function fetchYcPayInNetworks(
  country: string,
  currency: string,
): Promise<{ id: string; name: string }[]> {
  const cc = country.trim().toUpperCase()
  const cur = currency.trim().toUpperCase()
  const networksRes = await fetchWithSession(
    `/api/yellowcard/pay-in-networks?country=${encodeURIComponent(cc)}&currency=${encodeURIComponent(cur)}`,
  )
  if (networksRes.ok) {
    const data = (await networksRes.json().catch(() => ({}))) as {
      networks?: { id: string; name: string }[]
    }
    return data.networks ?? []
  }
  if (networksRes.status !== 404) {
    throw new Error('Could not load mobile money networks')
  }

  const rails =
    (await prefetchYcReceiveRails(cc, cur)) ??
    (await (async () => {
      const res = await fetchWithSession(
        `/api/yellowcard/receive-rails?country=${encodeURIComponent(cc)}&currency=${encodeURIComponent(cur)}`,
      )
      if (!res.ok) return null
      return (await res.json().catch(() => null)) as ReceiveRailsResponse | null
    })())
  return rails?.momoNetworks ?? []
}

export async function prefetchYcPayInRates(): Promise<YcRateClientRow[] | null> {
  const cached = readCachedYcPayInRates()
  if (cached) return cached

  if (payInRatesInflight) return payInRatesInflight

  payInRatesInflight = (async () => {
    try {
      const res = await fetchWithSession(
        `/api/fx/yc-rates?destinations=${encodeURIComponent(YC_PAY_IN_RATES_DESTINATION)}`,
      )
      const data = (await res.json().catch(() => ({}))) as { rates?: YcRateClientRow[] }
      const rates = data.rates ?? []
      writeYcPayInRatesCache(rates)
      return rates
    } catch {
      return null
    } finally {
      payInRatesInflight = null
    }
  })()

  return payInRatesInflight
}

export async function warmYcLocalDepositCaches(input: {
  residenceCountry: string
  localPayInCurrency: string
}): Promise<void> {
  const country = input.residenceCountry.trim().toUpperCase()
  const currency = input.localPayInCurrency.trim().toUpperCase()
  if (!country || !currency) return
  await Promise.allSettled([
    prefetchYcReceiveRails(country, currency),
    prefetchYcPayInRates(),
  ])
}

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

const PAY_IN_NETWORKS_CACHE_TTL_MS = 5 * 60_000
const payInNetworksCache = new Map<string, { networks: { id: string; name: string }[]; at: number }>()
const payInNetworksInflight = new Map<string, Promise<{ id: string; name: string }[]>>()

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
  if (data.momoNetworks?.length) {
    seedCachedYcPayInNetworks(country, currency, data.momoNetworks)
  }
}

export function seedCachedYcPayInNetworks(
  country: string,
  currency: string,
  networks: { id: string; name: string }[],
): void {
  const cc = country.trim().toUpperCase()
  const cur = currency.trim().toUpperCase()
  if (!cc || !cur) return
  payInNetworksCache.set(receiveRailsCacheKey(cc, cur), { networks, at: Date.now() })
}

/** Returns cached networks, or null when nothing is cached yet. */
export function readCachedYcPayInNetworks(
  country: string,
  currency: string,
): { id: string; name: string }[] | null {
  const cc = country.trim().toUpperCase()
  const cur = currency.trim().toUpperCase()
  if (!cc || !cur) return null

  const key = receiveRailsCacheKey(cc, cur)
  const hit = payInNetworksCache.get(key)
  if (hit) {
    if (Date.now() - hit.at <= PAY_IN_NETWORKS_CACHE_TTL_MS) return hit.networks
    payInNetworksCache.delete(key)
  }

  const rails = readCachedReceiveRails(cc, cur)
  if (rails?.momoNetworks?.length) return rails.momoNetworks
  return null
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

async function loadYcPayInNetworks(
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

/** Idempotent prefetch — dedupes in-flight requests and writes cache on success. */
export async function prefetchYcPayInNetworks(
  country: string,
  currency: string,
): Promise<{ id: string; name: string }[]> {
  const cc = country.trim().toUpperCase()
  const cur = currency.trim().toUpperCase()
  if (!cc || !cur) return []

  const cached = readCachedYcPayInNetworks(cc, cur)
  if (cached) return cached

  const key = receiveRailsCacheKey(cc, cur)
  const inflight = payInNetworksInflight.get(key)
  if (inflight) return inflight

  const task = loadYcPayInNetworks(cc, cur)
    .then((networks) => {
      seedCachedYcPayInNetworks(cc, cur, networks)
      return networks
    })
    .finally(() => {
      payInNetworksInflight.delete(key)
    })

  payInNetworksInflight.set(key, task)
  return task
}

/** MoMo networks for pay-in review — falls back to receive-rails when pay-in-networks is absent. */
export async function fetchYcPayInNetworks(
  country: string,
  currency: string,
): Promise<{ id: string; name: string }[]> {
  return prefetchYcPayInNetworks(country, currency)
}

type GridPayInRateRow = {
  from_currency: string
  to_currency: string
  rate: number
  grid_mid?: number | null
}

const gridPayInRatesCache = new Map<string, { rates: YcRateClientRow[]; at: number }>()
const gridPayInRatesInflight = new Map<string, Promise<YcRateClientRow[] | null>>()

function mapGridRatesToPayInClient(rows: GridPayInRateRow[]): YcRateClientRow[] {
  return rows.map((row) => ({
    from_currency: String(row.from_currency ?? "").toUpperCase(),
    to_currency: String(row.to_currency ?? "").toUpperCase(),
    rate: Number(row.rate ?? 0),
    easner_sell: Number(row.rate ?? 0),
    yc_buy: row.grid_mid != null ? Number(row.grid_mid) : null,
  }))
}

export function readCachedGridPayInRates(currency: string): YcRateClientRow[] | null {
  const cur = currency.trim().toUpperCase()
  if (!cur) return null
  const hit = gridPayInRatesCache.get(cur)
  if (!hit) return null
  if (Date.now() - hit.at > PAY_IN_RATES_CACHE_TTL_MS) {
    gridPayInRatesCache.delete(cur)
    return null
  }
  return hit.rates
}

/** Grid pay-in rates: local fiat → USD (customer rate + grid mid for fee preview). */
export async function prefetchGridPayInRates(currency: string): Promise<YcRateClientRow[] | null> {
  const cur = currency.trim().toUpperCase()
  if (!cur) return null

  const cached = readCachedGridPayInRates(cur)
  if (cached) return cached

  const inflight = gridPayInRatesInflight.get(cur)
  if (inflight) return inflight

  const task = (async () => {
    try {
      const res = await fetchWithSession(
        `/api/fx/grid-rates?destinations=${encodeURIComponent(cur)}`,
      )
      const data = (await res.json().catch(() => ({}))) as { rates?: GridPayInRateRow[] }
      const rates = mapGridRatesToPayInClient(data.rates ?? [])
      gridPayInRatesCache.set(cur, { rates, at: Date.now() })
      return rates
    } catch {
      return null
    } finally {
      gridPayInRatesInflight.delete(cur)
    }
  })()

  gridPayInRatesInflight.set(cur, task)
  return task
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
    prefetchYcReceiveRails(country, currency).then((rails) => {
      if (!rails?.rails.mobile_money.available) return rails
      if (rails.momoNetworks?.length) return rails
      return prefetchYcPayInNetworks(country, currency).then(() => rails)
    }),
    prefetchYcPayInRates(),
  ])
}

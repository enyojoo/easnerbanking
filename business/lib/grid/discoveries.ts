import { gridFetch, gridFetchAllPages } from "./http"
import type { GridDiscovery, GridExchangeRate } from "./types"
import { gridCurrencyCode, gridExchangeRateMid } from "./types"

let discoveryCache: { at: number; rows: GridDiscovery[] } | null = null
const DISCOVERY_TTL_MS = 5 * 60_000

const BRIDGE_CURRENCIES = new Set(["USD", "USDC", "USDT", "EURC", "BTC", "ETH", "SOL", "PYUSD"])

const MOMO_HINTS =
  /mobile|momo|m-pesa|mpesa|airtel|mtn|orange|tigo|wave|vodafone|moov|tnm|free money/i

export function isMomoGridDiscovery(d: GridDiscovery): boolean {
  const label = `${String(d.displayName ?? d.bankName ?? "")} ${String(d.bankName ?? "")}`
  if (MOMO_HINTS.test(label)) return true
  const rails = (d.paymentRails ?? []).map((r) => String(r).trim().toUpperCase())
  return rails.some((r) => r.includes("MOBILE") || r.includes("MOMO"))
}

/** Distinct local fiat codes from Grid discoveries (excludes bridge/stable assets). */
export function collectFiatCodesFromDiscoveries(discoveries: GridDiscovery[]): string[] {
  const fiats = new Set<string>()
  for (const row of discoveries) {
    const code = String(row.currency ?? "").trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) continue
    if (BRIDGE_CURRENCIES.has(code)) continue
    fiats.add(code)
  }
  return [...fiats].sort()
}

export function pickGridExchangeRateQuote(
  rows: GridExchangeRate[],
  fromCurrency: string,
  toCurrency: string,
): GridExchangeRate | null {
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  const matches = rows.filter((row) => {
    if (gridCurrencyCode(row.sourceCurrency) !== from) return false
    if (gridCurrencyCode(row.destinationCurrency) !== to) return false
    return gridExchangeRateMid(row) > 0
  })
  if (!matches.length) return null

  const bank = matches.find((row) => {
    const rail = String(row.destinationPaymentRail ?? "").trim().toUpperCase()
    return rail.includes("BANK") || rail.includes("SWIFT") || rail.includes("WIRE")
  })
  return bank ?? matches[0] ?? null
}

export async function listGridDiscoveries(forceRefresh = false): Promise<GridDiscovery[]> {
  if (!forceRefresh && discoveryCache && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.rows
  }
  try {
    const rows = await gridFetchAllPages<GridDiscovery>({
      path: "/discoveries",
      mapPage: (p) => p.data ?? [],
    })
    discoveryCache = { at: Date.now(), rows }
    return rows
  } catch (e) {
    console.warn("[grid] discoveries load failed", e)
    return discoveryCache?.rows ?? []
  }
}

export function gridDiscoverySupportsCorridor(input: {
  discoveries: GridDiscovery[]
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
}): boolean {
  const country = input.countryCode.trim().toUpperCase()
  const currency = input.currencyCode.trim().toUpperCase()
  if (!country || !currency) return false

  return input.discoveries.some((d) => {
    const dCountry = String(d.country ?? "").trim().toUpperCase()
    const dCurrency = String(d.currency ?? "").trim().toUpperCase()
    if (dCountry !== country || dCurrency !== currency) return false

    const momo = isMomoGridDiscovery(d)
    const rails = (d.paymentRails ?? []).map((r) => String(r).trim().toUpperCase())
    const hasBankRail = rails.some(
      (r) =>
        r.includes("BANK") ||
        r.includes("SWIFT") ||
        r.includes("WIRE") ||
        r.includes("ACH") ||
        r.includes("FEDNOW") ||
        r.includes("SEPA") ||
        r === "RTP",
    )

    if (input.rail === "mobile_money") {
      return momo || rails.some((r) => r.includes("MOBILE") || r.includes("MOMO"))
    }

    if (momo && !hasBankRail) return false
    return hasBankRail || rails.length === 0 || !momo
  })
}

/** Fetch USD→fiat quotes one pair at a time (production-safe when bulk /exchange-rates fails). */
export async function fetchGridUsdToFiatExchangeRates(
  fiatCodes: string[],
): Promise<{ rates: GridExchangeRate[]; skipped: string[] }> {
  const unique = [
    ...new Set(
      fiatCodes
        .map((code) => code.trim().toUpperCase())
        .filter((code) => /^[A-Z]{3}$/.test(code) && code !== "USD"),
    ),
  ].sort()

  const rates: GridExchangeRate[] = []
  const skipped: string[] = []

  for (const fiat of unique) {
    try {
      const page = await gridFetch<{ data?: GridExchangeRate[] }>({
        method: "GET",
        path: `/exchange-rates?sourceCurrency=USD&destinationCurrency=${encodeURIComponent(fiat)}`,
      })
      const picked = pickGridExchangeRateQuote(page.data ?? [], "USD", fiat)
      if (!picked) {
        skipped.push(fiat)
        continue
      }
      rates.push({
        ...picked,
        sourceCurrency: "USD",
        destinationCurrency: fiat,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[grid] exchange-rates USD→${fiat} failed:`, msg)
      skipped.push(fiat)
    }
  }

  return { rates, skipped }
}

export async function listGridExchangeRates(opts?: {
  fiatCodes?: string[]
}): Promise<GridExchangeRate[]> {
  if (opts?.fiatCodes?.length) {
    return (await fetchGridUsdToFiatExchangeRates(opts.fiatCodes)).rates
  }

  try {
    return await gridFetchAllPages<GridExchangeRate>({
      path: "/exchange-rates",
      mapPage: (p) => p.data ?? [],
    })
  } catch (e) {
    console.warn("[grid] bulk exchange-rates failed; falling back to per-pair fetch", e)
    const discoveries = await listGridDiscoveries(true)
    const fiats = collectFiatCodesFromDiscoveries(discoveries)
    if (!fiats.length) return []
    return (await fetchGridUsdToFiatExchangeRates(fiats)).rates
  }
}

export function findGridExchangeRate(
  rates: GridExchangeRate[],
  fromCurrency: string,
  toCurrency: string,
): GridExchangeRate | null {
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  return (
    rates.find(
      (r) =>
        gridCurrencyCode(r.sourceCurrency) === from &&
        gridCurrencyCode(r.destinationCurrency) === to,
    ) ?? null
  )
}

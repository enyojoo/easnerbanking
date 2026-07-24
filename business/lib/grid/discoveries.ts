import { gridFetch, gridFetchAllPages } from "./http"
import type { GridDiscovery, GridExchangeRate } from "./types"
import { gridCurrencyCode, gridExchangeRateMid } from "./types"

let discoveryCache: { at: number; rows: GridDiscovery[] } | null = null
const DISCOVERY_TTL_MS = 5 * 60_000

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
    const rails = (d.paymentRails ?? []).map((r) => String(r).trim().toUpperCase())
    if (input.rail === "mobile_money") {
      return rails.some((r) => r.includes("MOBILE") || r.includes("MOMO"))
    }
    return rails.some((r) => r.includes("BANK") || r.includes("SWIFT") || rails.length === 0)
  })
}

export async function listGridExchangeRates(): Promise<GridExchangeRate[]> {
  try {
    return await gridFetchAllPages<GridExchangeRate>({
      path: "/exchange-rates",
      mapPage: (p) => p.data ?? [],
    })
  } catch (e) {
    console.warn("[grid] exchange-rates load failed", e)
    return []
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

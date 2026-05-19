import { fetchSellChannelItems } from "@/lib/noah/payout-prepare"
import { getNoahSettlementCryptoCurrency } from "@/lib/noah/config"

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { ok: boolean; at: number }>()

function cacheKey(country: string, fiat: string, crypto: string): string {
  return `${country.toUpperCase()}:${fiat.toUpperCase()}:${crypto.toUpperCase()}`
}

export type NoahSellChannelCheck = {
  country: string
  fiatCurrency: string
  cryptoCurrency?: string
}

/**
 * True when Noah returns at least one sell channel for country + fiat (executable payout).
 * Results are cached in-memory per process (~10 min).
 */
export async function hasNoahSellChannel(input: NoahSellChannelCheck): Promise<boolean> {
  const country = input.country.trim().toUpperCase()
  const fiatCurrency = input.fiatCurrency.trim().toUpperCase()
  const cryptoCurrency = (input.cryptoCurrency || getNoahSettlementCryptoCurrency()).trim()
  if (!country || !fiatCurrency) return false

  const key = cacheKey(country, fiatCurrency, cryptoCurrency)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ok

  try {
    const items = await fetchSellChannelItems({ country, fiatCurrency, cryptoCurrency })
    const ok = items.length > 0
    cache.set(key, { ok, at: Date.now() })
    return ok
  } catch {
    cache.set(key, { ok: false, at: Date.now() })
    return false
  }
}

/** Clear cache (tests / admin sync). */
export function clearNoahSellChannelCache(): void {
  cache.clear()
}

export async function annotateCorridorsWithNoahAvailability<
  T extends { country_code: string; currency_code: string },
>(rows: T[]): Promise<Array<T & { noah_sell_available: boolean }>> {
  const crypto = getNoahSettlementCryptoCurrency()
  return Promise.all(
    rows.map(async (row) => {
      const noah_sell_available = await hasNoahSellChannel({
        country: row.country_code,
        fiatCurrency: row.currency_code,
        cryptoCurrency: crypto,
      })
      return { ...row, noah_sell_available }
    }),
  )
}

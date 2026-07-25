import { fetchSellChannelItems } from "@/lib/noah/payout-prepare"
import { pickChannelForRail } from "@/lib/noah/form-schema-hints"
import { getNoahSettlementCryptoCurrency } from "@/lib/noah/config"

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { ok: boolean; at: number }>()

type PayoutRail = "bank_transfer" | "mobile_money"

function cacheKey(country: string, fiat: string, crypto: string, rail: PayoutRail): string {
  return `${country.toUpperCase()}:${fiat.toUpperCase()}:${crypto.toUpperCase()}:${rail}`
}

function normalizeRail(rail: string | undefined): PayoutRail {
  return rail === "mobile_money" ? "mobile_money" : "bank_transfer"
}

export type NoahSellChannelCheck = {
  country: string
  fiatCurrency: string
  cryptoCurrency?: string
}

export type NoahSellChannelRailCheck = NoahSellChannelCheck & {
  rail: PayoutRail
}

/**
 * True when Noah returns a sell channel matching the corridor rail (Bank vs Identifier).
 * Results are cached in-memory per process (~10 min).
 */
export async function hasNoahSellChannelForRail(input: NoahSellChannelRailCheck): Promise<boolean> {
  const country = input.country.trim().toUpperCase()
  const fiatCurrency = input.fiatCurrency.trim().toUpperCase()
  const cryptoCurrency = (input.cryptoCurrency || getNoahSettlementCryptoCurrency()).trim()
  const rail = normalizeRail(input.rail)
  if (!country || !fiatCurrency) return false

  const key = cacheKey(country, fiatCurrency, cryptoCurrency, rail)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ok

  try {
    const items = await fetchSellChannelItems({ country, fiatCurrency, cryptoCurrency })
    const ok = pickChannelForRail(items, rail) != null
    cache.set(key, { ok, at: Date.now() })
    return ok
  } catch {
    cache.set(key, { ok: false, at: Date.now() })
    return false
  }
}

/**
 * True when Noah returns at least one bank sell channel for country + fiat.
 * Prefer hasNoahSellChannelForRail when the corridor rail is known.
 */
export async function hasNoahSellChannel(input: NoahSellChannelCheck): Promise<boolean> {
  return hasNoahSellChannelForRail({ ...input, rail: "bank_transfer" })
}

/** Clear cache (tests / admin sync). */
export function clearNoahSellChannelCache(): void {
  cache.clear()
}

export async function annotateCorridorsWithNoahAvailability<
  T extends { country_code: string; currency_code: string; rail?: string },
>(rows: T[]): Promise<Array<T & { noah_sell_available: boolean }>> {
  const crypto = getNoahSettlementCryptoCurrency()
  return Promise.all(
    rows.map(async (row) => {
      const noah_sell_available = await hasNoahSellChannelForRail({
        country: row.country_code,
        fiatCurrency: row.currency_code,
        cryptoCurrency: crypto,
        rail: normalizeRail(row.rail),
      })
      return { ...row, noah_sell_available }
    }),
  )
}

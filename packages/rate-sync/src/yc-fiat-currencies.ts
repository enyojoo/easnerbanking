import type { YcCrossPairInput } from "./yc-sync-to-supabase"

/** Bridge currencies stored in yellowcard_rates (not ingested from YC /rates as locals). */
export const YC_RATE_BRIDGE_CURRENCIES = new Set(["USD", "USDC"])

/**
 * Stablecoins / on-chain assets returned by YC /rates that we do not store.
 * Settlement uses USD/USDC legs only: local↔USD and local↔USDC.
 */
export const YC_EXCLUDED_CRYPTO_CURRENCIES = new Set([
  "CUSD",
  "USDT",
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "TRX",
  "PYUSD",
  "EURC",
  "XAUT",
  "DOGE",
  "MATIC",
  "AVAX",
  "CELO",
  "CUSDCELO",
])

/** True when `code` is a fiat local leg we ingest from YC /rates. */
export function isYcFiatCurrency(code: string): boolean {
  const c = String(code || "")
    .trim()
    .toUpperCase()
  if (!c || !/^[A-Z]{3}$/.test(c)) return false
  if (YC_RATE_BRIDGE_CURRENCIES.has(c)) return false
  if (YC_EXCLUDED_CRYPTO_CURRENCIES.has(c)) return false
  return true
}

/** True when a stored yellowcard_rates row should be served to customers. */
export function isYcStoredRatePair(fromCurrency: string, toCurrency: string): boolean {
  const from = String(fromCurrency || "")
    .trim()
    .toUpperCase()
  const to = String(toCurrency || "")
    .trim()
    .toUpperCase()
  if (!from || !to) return false
  if (YC_EXCLUDED_CRYPTO_CURRENCIES.has(from) || YC_EXCLUDED_CRYPTO_CURRENCIES.has(to)) {
    return false
  }
  const fromOk = isYcFiatCurrency(from) || YC_RATE_BRIDGE_CURRENCIES.has(from)
  const toOk = isYcFiatCurrency(to) || YC_RATE_BRIDGE_CURRENCIES.has(to)
  return fromOk && toOk
}

/** All ordered fiat cross pairs (e.g. NGN→KES) for corridors YC supports. */
export function buildYcCrossPairsFromFiats(fiats: string[]): YcCrossPairInput[] {
  const sorted = [...new Set(fiats.map((f) => f.trim().toUpperCase()).filter(isYcFiatCurrency))].sort()
  const pairs: YcCrossPairInput[] = []
  for (const from of sorted) {
    for (const to of sorted) {
      if (from === to) continue
      pairs.push({ from_currency: from, to_currency: to })
    }
  }
  return pairs
}

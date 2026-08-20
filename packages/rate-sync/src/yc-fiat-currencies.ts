import type { YcCrossPairInput } from "./yc-sync-to-supabase"

/**
 * Product wallet label (USD) and settlement ticker used only as `to_currency` on pay-in legs (USDC).
 * USD = customer balance currency; USDC = on-chain settlement (1:1 with USD). Never ingest as locals.
 */
export const YC_RATE_BRIDGE_CURRENCIES = new Set(["USD", "USDC"])

/**
 * Stablecoins / on-chain assets returned by YC /rates that we do not store.
 * Safety net alongside corridor allowlist – settlement uses USD product + USDC chain only.
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
  "ADA",
  "XRP",
  "XLM",
  "LTC",
  "LINK",
  "DOT",
  "ATOM",
  "UNI",
  "AAVE",
  "SHIB",
  "PEPE",
  "TON",
  "SUI",
  "APT",
  "ARB",
  "OP",
  "WBTC",
  "WETH",
])

/** True when `code` looks like a fiat local (not USD/USDC/crypto). Prefer corridor allowlist at sync. */
export function isYcFiatCurrency(code: string): boolean {
  const c = String(code || "")
    .trim()
    .toUpperCase()
  if (!c || !/^[A-Z]{3}$/.test(c)) return false
  if (YC_RATE_BRIDGE_CURRENCIES.has(c)) return false
  if (YC_EXCLUDED_CRYPTO_CURRENCIES.has(c)) return false
  return true
}

/**
 * Canonical yellowcard_rates pairs only:
 * - USD → fiat (balance payout, Noah-parity product label)
 * - fiat → USDC (local pay-in / fund balance + cross leg refs)
 * - fiat → fiat (cross-border)
 * Rejects USDC as from_currency and any crypto codes.
 */
export function isYcStoredRatePair(fromCurrency: string, toCurrency: string): boolean {
  const from = String(fromCurrency || "")
    .trim()
    .toUpperCase()
  const to = String(toCurrency || "")
    .trim()
    .toUpperCase()
  if (!from || !to || from === to) return false
  if (YC_EXCLUDED_CRYPTO_CURRENCIES.has(from) || YC_EXCLUDED_CRYPTO_CURRENCIES.has(to)) {
    return false
  }
  // Never store USDC → * (misleading pay-in math as payout)
  if (from === "USDC") return false

  // Balance payout: USD → local fiat
  if (from === "USD") {
    return isYcFiatCurrency(to)
  }

  // Local pay-in leg: fiat → USDC
  if (to === "USDC") {
    return isYcFiatCurrency(from)
  }

  // Cross-border: fiat → fiat
  if (isYcFiatCurrency(from) && isYcFiatCurrency(to)) {
    return true
  }

  return false
}

/** True when a currency is in an optional allowlist (or allowlist is empty/undefined → no filter). */
export function isYcAllowlistedFiat(code: string, allowlist?: ReadonlySet<string> | null): boolean {
  if (!isYcFiatCurrency(code)) return false
  if (!allowlist || allowlist.size === 0) return true
  return allowlist.has(code.trim().toUpperCase())
}

/**
 * Stored pair check with optional corridor fiat allowlist.
 * When allowlist is set, both fiats in the pair must be members (USD/USDC bridges exempt).
 */
export function isYcStoredRatePairForAllowlist(
  fromCurrency: string,
  toCurrency: string,
  allowlist?: ReadonlySet<string> | null,
): boolean {
  if (!isYcStoredRatePair(fromCurrency, toCurrency)) return false
  if (!allowlist || allowlist.size === 0) return true
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  if (from === "USD") return allowlist.has(to)
  if (to === "USDC") return allowlist.has(from)
  return allowlist.has(from) && allowlist.has(to)
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

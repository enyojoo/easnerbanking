import { currencyToCountryCode } from "../flags/currency-mapping"

export type CurrencyCatalogEntry = {
  code: string
  name: string
  symbol: string | null
}

const NON_ISO_ASSETS: Array<{ code: string; name: string; symbol: string | null }> = [
  { code: "USDC", name: "USD Coin", symbol: null },
  { code: "USDT", name: "Tether USD", symbol: null },
  { code: "EURC", name: "Euro Coin", symbol: null },
  { code: "BTC", name: "Bitcoin", symbol: null },
  { code: "SOL", name: "Solana", symbol: null },
  { code: "PYUSD", name: "PayPal USD", symbol: null },
]

function safeCurrencyName(code: string): string {
  const upper = code.trim().toUpperCase()
  const manual = NON_ISO_ASSETS.find((a) => a.code === upper)
  if (manual) return manual.name

  try {
    // Intl.DisplayNames exists in modern runtimes (Node 18+/browsers)
    const dn = new Intl.DisplayNames(["en"], { type: "currency" })
    const out = dn.of(upper)
    return out || upper
  } catch {
    return upper
  }
}

function safeCurrencySymbol(code: string): string | null {
  const upper = code.trim().toUpperCase()
  const manual = NON_ISO_ASSETS.find((a) => a.code === upper)
  if (manual) return manual.symbol

  try {
    // Use narrow symbol when available. Example: "$", "€", "£"
    const formatted = new Intl.NumberFormat("en", {
      style: "currency",
      currency: upper,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(0)
    // Remove digits/whitespace/punctuation, keep the currency symbol-ish portion.
    const sym = formatted.replace(/[0-9\s.,]/g, "")
    return sym || null
  } catch {
    return null
  }
}

/**
 * Canonical currency catalog for Easner UX.
 * - Universe comes from code.
 * - Operational enable/disable should be controlled via DB overrides (not here).
 */
export function getCurrencyCatalog(): CurrencyCatalogEntry[] {
  const isoCodes = Object.keys(currencyToCountryCode)
  const codes = Array.from(new Set([...isoCodes, ...NON_ISO_ASSETS.map((a) => a.code)]))
  codes.sort((a, b) => a.localeCompare(b))
  return codes.map((code) => ({
    code,
    name: safeCurrencyName(code),
    symbol: safeCurrencySymbol(code),
  }))
}


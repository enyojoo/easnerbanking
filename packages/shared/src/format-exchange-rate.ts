import { getCurrencySymbol } from "./currency-symbol"

function trimTrailingZeros(value: string): string {
  if (!value.includes(".")) return value
  return value.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "")
}

/**
 * Human-friendly FX rate for send UI (not raw provider precision).
 * e.g. 1342.7546 → "1,342.75", 0.04857 → "0.049"
 */
export function formatExchangeRate(rate: number): string {
  if (!Number.isFinite(rate)) return "—"
  const abs = Math.abs(rate)
  if (abs === 0) return "0"

  if (abs >= 1) {
    const rounded = Math.round(rate * 100) / 100
    return rounded.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  if (abs >= 0.01) {
    return trimTrailingZeros((Math.round(rate * 1000) / 1000).toFixed(3))
  }

  if (abs >= 0.001) {
    return trimTrailingZeros((Math.round(rate * 10000) / 10000).toFixed(4))
  }

  return trimTrailingZeros(Number(rate.toPrecision(3)).toString())
}

function rateAmountPrefix(symbol: string, formattedRate: string): string {
  if (symbol.length === 3 && symbol === symbol.toUpperCase()) {
    return `${symbol} ${formattedRate}`
  }
  return `${symbol}${formattedRate}`
}

/** e.g. `$1 = ₦1,342.74` (symbols before amounts, rounded rate). */
export function formatSendRateLabel(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): string {
  const fromSym = getCurrencySymbol(fromCurrency)
  const toSym = getCurrencySymbol(toCurrency)
  const formatted = formatExchangeRate(rate)
  return `${rateAmountPrefix(fromSym, "1")} = ${rateAmountPrefix(toSym, formatted)}`
}

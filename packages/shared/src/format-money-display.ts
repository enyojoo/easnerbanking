import { getCurrencySymbol } from "./currency-symbol"
import { isZeroDecimalPayoutCurrency } from "./noah-send-rates"

function resolveFractionDigits(
  currency: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): { min: number; max: number } {
  if (
    options?.minimumFractionDigits != null ||
    options?.maximumFractionDigits != null
  ) {
    const min = options.minimumFractionDigits ?? options.maximumFractionDigits ?? 2
    const max = options.maximumFractionDigits ?? options.minimumFractionDigits ?? 2
    return { min, max }
  }
  if (isZeroDecimalPayoutCurrency(currency)) {
    return { min: 0, max: 0 }
  }
  return { min: 2, max: 2 }
}

/** Symbol + formatted amount (no trailing ISO code). */
export function formatMoneyDisplay(
  amount: number,
  currency: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const code = String(currency || "USD").trim().toUpperCase()
  const { min, max } = resolveFractionDigits(code, options)
  const sym = getCurrencySymbol(code)
  const value = Number.isFinite(amount) ? amount : 0
  const displayAmount =
    min === 0 && max === 0 && isZeroDecimalPayoutCurrency(code)
      ? Math.round(value)
      : value
  const formatted = displayAmount.toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })
  return `${sym}${formatted}`
}

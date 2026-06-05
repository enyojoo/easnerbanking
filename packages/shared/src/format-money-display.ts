import { getSendAmountFieldSymbol } from "./currency-symbol"
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

function formatAmountDigits(value: number, min: number, max: number): string {
  if (min === 0 && max === 0) {
    return Math.round(value).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  }
  const rounded = Math.round(value * 100) / 100
  const fractionalPart = Math.abs(rounded - Math.trunc(rounded))
  const showDecimals = fractionalPart >= 0.01
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  })
}

/** Symbol + formatted amount (no trailing ISO code). */
export function formatMoneyDisplay(
  amount: number,
  currency: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const code = String(currency || "USD").trim().toUpperCase()
  const { min, max } = resolveFractionDigits(code, options)
  const sym = getSendAmountFieldSymbol(code)
  const value = Number.isFinite(amount) ? amount : 0
  const displayAmount =
    min === 0 && max === 0 && isZeroDecimalPayoutCurrency(code)
      ? Math.round(value)
      : value
  const useExplicitDigits =
    options?.minimumFractionDigits != null || options?.maximumFractionDigits != null
  const formatted = useExplicitDigits
    ? displayAmount.toLocaleString("en-US", {
        minimumFractionDigits: min,
        maximumFractionDigits: max,
      })
    : formatAmountDigits(displayAmount, min, max)
  return `${sym}${formatted}`
}

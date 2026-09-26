import { getSendAmountFieldSymbol } from "./currency-symbol"

function resolveFractionDigits(
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
  // Display the amount as-is (up to 2dp). Do not round via Noah zero-decimal payout
  // rules – YC pay-in requires exact local amounts (e.g. ₦3,678.96 not ₦3,679).
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
    minimumFractionDigits: showDecimals ? Math.min(2, max) : 0,
    maximumFractionDigits: showDecimals ? Math.min(2, max) : 0,
  })
}

/**
 * Symbol + formatted amount, the same for every currency and locale:
 * symbol first, no space, comma thousands, dot decimals ("$24,190.32", "€12,480.00",
 * "₦3,678.96", "KSh1,500.90"). Negatives use a true minus before the symbol ("−$5").
 */
export function formatMoneyDisplay(
  amount: number,
  currency: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const code = String(currency || "USD").trim().toUpperCase()
  const { min, max } = resolveFractionDigits(options)
  const sym = getSendAmountFieldSymbol(code)
  const raw = Number.isFinite(amount) ? amount : 0
  const sign = raw < 0 ? "\u2212" : ""
  const value = Math.abs(raw)
  const useExplicitDigits =
    options?.minimumFractionDigits != null || options?.maximumFractionDigits != null
  const formatted = useExplicitDigits
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: min,
        maximumFractionDigits: max,
      })
    : formatAmountDigits(value, min, max)
  return `${sign}${sym}${formatted}`
}

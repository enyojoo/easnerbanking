import { getCurrencySymbol } from "./currency-symbol"

/** Symbol + formatted amount (no trailing ISO code). */
export function formatMoneyDisplay(
  amount: number,
  currency: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const code = String(currency || "USD").trim().toUpperCase()
  const min = options?.minimumFractionDigits ?? 2
  const max = options?.maximumFractionDigits ?? 2
  const sym = getCurrencySymbol(code)
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })
  return `${sym}${formatted}`
}

import { getCurrencySymbol } from "./currency-symbol"

/** Symbol + formatted amount (no trailing ISO code). */
export function formatMoneyDisplay(
  amount: number,
  currency: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const min = options?.minimumFractionDigits ?? 2
  const max = options?.maximumFractionDigits ?? 2
  const sym = getCurrencySymbol(currency)
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })
  if (sym.length <= 4 && sym === sym.toUpperCase() && !/[₦€£$]/.test(sym)) {
    return `${formatted} ${sym}`
  }
  return `${sym}${formatted}`
}

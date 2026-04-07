import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const defaultCurrency = "USD"

/** Narrow glyphs for common corridor codes; everything else uses Intl. */
const CURRENCY_SYMBOL_OVERRIDES: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  NGN: "₦",
  KES: "KSh",
  GHS: "₵",
  RUB: "₽",
  /** Intl narrowSymbol is F CFA / FCFA; corridor UIs expect the ISO code. */
  XOF: "XOF",
  XAF: "XAF",
}

/** Currency symbol for UI (send, pay, invoices, formatCurrency). */
export function getCurrencySymbol(currency: string): string {
  const code = (currency || defaultCurrency).trim().toUpperCase()
  const o = CURRENCY_SYMBOL_OVERRIDES[code]
  if (o) return o
  try {
    const part = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")
    return part?.value ?? code
  } catch {
    return code
  }
}

/** Format amount with currency symbol and thousands separators (e.g. $250,000,000.00) */
export function formatCurrency(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency)
  const formatted = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${symbol}${formatted}`
}

export function formatDate(dateString: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  })
}

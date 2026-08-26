import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  formatMoneyDisplay,
  getCurrencySymbol,
  getSendAmountFieldSymbol,
} from "@easner/shared"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const defaultCurrency = "USD"

export { getCurrencySymbol, getSendAmountFieldSymbol }

/**
 * Format amount with currency symbol (e.g. $10 or $10.50).
 * Matches mobile {@link formatMoneyDisplay}: hide trailing .00, keep cents when present.
 */
export function formatCurrency(amount: number, currency: string): string {
  return formatMoneyDisplay(amount, currency)
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

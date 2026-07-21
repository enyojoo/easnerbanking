/**
 * Formatters for various input types
 */

import { easnerBrand, formatMoneyDisplay, getCurrencySymbol } from '@easner/shared'

/**
 * Format phone number as user types
 */
export function formatPhoneNumber(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '')
  
  // Format based on length
  if (digits.length <= 3) {
    return digits
  } else if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  } else if (digits.length <= 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  } else {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
  }
}

export function formatInternationalPhone(value: string): string {
  const cleaned = value.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\D/g, '')}`
  return cleaned.replace(/\D/g, '')
}

/**
 * Format account number (spaces every 4 digits)
 */
export function formatAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

/**
 * Format IBAN (spaces every 4 characters)
 */
export function formatIBAN(value: string): string {
  const cleaned = value.replace(/\s/g, '').toUpperCase()
  return cleaned.replace(/(.{4})/g, '$1 ').trim()
}

/**
 * Format card number (spaces every 4 digits)
 */
export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

/**
 * Format sort code (spaces every 2 digits)
 */
export function formatSortCode(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.replace(/(.{2})/g, '$1-').replace(/-$/, '')
}

/**
 * Format routing number (9 digits, no spaces)
 */
export function formatRoutingNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, 9)
}

/**
 * Format amount with currency symbol
 */
export function formatCurrency(
  amount: number,
  currency: string,
): string {
  return formatMoneyDisplay(Math.abs(amount), currency)
}

/** Signed amount for transaction list / detail heroes (e.g. `-₦5,000.00`). */
export function formatSignedCurrency(
  amount: number,
  currency: string,
  isReceived: boolean,
): string {
  const sign = isReceived ? '+' : '-'
  return `${sign}${formatMoneyDisplay(Math.abs(amount), currency)}`
}

export { getCurrencySymbol }

export type TransactionStatusTone =
  | 'completed'
  | 'pending'
  | 'processing'
  | 'failed'
  | 'cancelled'
  | 'neutral'

export type TransactionStatusDisplay = {
  label: string
  color: string
  tone: TransactionStatusTone
}

/**
 * Map Bridge API transaction status to user-friendly label, legacy raw color (kept
 * for backwards-compat call sites), and a `tone` that the new `StatusPill` primitive
 * consumes directly.
 */
export function getTransactionStatusDisplay(status: string): TransactionStatusDisplay | null {
  if (!status) return null
  const statusLower = status.toLowerCase()
  if (statusLower.includes('processed') || statusLower.includes('completed')) {
    return { label: 'Completed', color: easnerBrand.emerald, tone: 'completed' }
  }
  if (statusLower.includes('pending') || statusLower.includes('awaiting') || statusLower.includes('scheduled') || statusLower.includes('received') || statusLower.includes('submitted')) {
    if (statusLower === 'confirming_payment' || statusLower === 'awaiting_payment') {
      return { label: 'Processing', color: easnerBrand.slate, tone: 'processing' }
    }
    return { label: 'Processing', color: easnerBrand.slate, tone: 'processing' }
  }
  if (statusLower.includes('failed') || statusLower.includes('returned')) {
    return { label: 'Failed', color: easnerBrand.oxblood, tone: 'failed' }
  }
  if (statusLower.includes('refunded')) {
    return { label: 'Refunded', color: easnerBrand.oxblood, tone: 'failed' }
  }
  if (statusLower.includes('review')) {
    return { label: 'In Review', color: easnerBrand.amber, tone: 'pending' }
  }
  if (statusLower.includes('cancelled')) {
    return { label: 'Cancelled', color: easnerBrand.slate, tone: 'cancelled' }
  }
  return {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    color: easnerBrand.slate,
    tone: 'neutral',
  }
}

/**
 * Format large numbers (e.g., 1.5M for 1,500,000)
 */
export function formatLargeNumber(amount: number): string {
  if (amount >= 1000000000) {
    return `${(amount / 1000000000).toFixed(1)}B`
  } else if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`
  }
  return amount.toString()
}























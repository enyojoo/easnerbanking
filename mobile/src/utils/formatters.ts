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

export function colorForTransactionStatusTone(tone: TransactionStatusTone): string {
  switch (tone) {
    case 'completed':
      return easnerBrand.emerald
    case 'pending':
    case 'processing':
      return easnerBrand.amber
    case 'failed':
      return easnerBrand.oxblood
    case 'cancelled':
      return easnerBrand.slate
    case 'neutral':
    default:
      return easnerBrand.slate
  }
}

function resolveTransactionStatusFromSlug(status: string): Omit<TransactionStatusDisplay, 'color'> | null {
  if (!status) return null
  const statusLower = status.toLowerCase()
  if (statusLower === 'processing_payment') {
    return { label: 'Processing', tone: 'processing' }
  }
  if (statusLower.includes('processed') || statusLower.includes('completed') || statusLower === 'settled') {
    return { label: 'Completed', tone: 'completed' }
  }
  if (statusLower.includes('failed') || statusLower.includes('returned')) {
    return { label: 'Failed', tone: 'failed' }
  }
  if (statusLower.includes('refunded')) {
    return { label: 'Refunded', tone: 'failed' }
  }
  if (statusLower.includes('review')) {
    return { label: 'In Review', tone: 'pending' }
  }
  if (statusLower.includes('cancelled')) {
    return { label: 'Cancelled', tone: 'cancelled' }
  }
  if (
    statusLower.includes('pending') ||
    statusLower.includes('awaiting') ||
    statusLower.includes('scheduled') ||
    statusLower.includes('received') ||
    statusLower.includes('submitted') ||
    statusLower.includes('processing') ||
    statusLower === 'confirming_payment'
  ) {
    return { label: 'Processing', tone: 'processing' }
  }
  return {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    tone: 'neutral',
  }
}

/**
 * Map ledger status slug (+ optional API label) to display label, color, and tone.
 * Tone drives list + hero colors: green completed, orange processing, red failed.
 * When `statusLabel` is provided it overrides the label only — tone still comes from `status`.
 */
export function getTransactionStatusDisplay(
  status: string,
  statusLabel?: string | null,
): TransactionStatusDisplay | null {
  const resolved = resolveTransactionStatusFromSlug(status)
  if (!resolved) return null
  const label = statusLabel?.trim() || resolved.label
  return {
    label,
    tone: resolved.tone,
    color: colorForTransactionStatusTone(resolved.tone),
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























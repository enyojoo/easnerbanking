import { getCurrencySymbol } from '@easner/shared'

/** Amount-field prefix on Send Amount (keypad). Pegged stables use fiat symbols. */
export function getSendAmountFieldSymbol(currency: string): string {
  const code = String(currency || '').trim().toUpperCase()
  if (code === 'USDT' || code === 'USDC' || code === 'STABLE') return '$'
  if (code === 'EURC') return '€'
  const sym = getCurrencySymbol(currency)
  const trimmed = sym?.trim()
  if (trimmed) return trimmed
  return code
}

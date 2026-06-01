import { getCurrencySymbol } from '@easner/shared'

/** Amount-field prefix on Send Amount (keypad). Dollar-pegged stables use $. */
export function getSendAmountFieldSymbol(currency: string): string {
  const code = String(currency || '').trim().toUpperCase()
  if (code === 'USDT' || code === 'USDC' || code === 'STABLE') return '$'
  const sym = getCurrencySymbol(currency)
  const trimmed = sym?.trim()
  if (trimmed) return trimmed
  return code
}

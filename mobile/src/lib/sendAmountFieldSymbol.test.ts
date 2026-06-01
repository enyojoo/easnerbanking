import { describe, expect, it, vi } from 'vitest'

vi.mock('@easner/shared', () => ({
  getCurrencySymbol: (currency: string) => {
    const map: Record<string, string> = { USD: '$', ZAR: 'R', KES: 'KSh' }
    return map[String(currency || '').toUpperCase()] ?? currency
  },
}))

import { getSendAmountFieldSymbol } from './sendAmountFieldSymbol'

describe('getSendAmountFieldSymbol', () => {
  it('uses $ for dollar-pegged stables', () => {
    expect(getSendAmountFieldSymbol('USDT')).toBe('$')
    expect(getSendAmountFieldSymbol('USDC')).toBe('$')
    expect(getSendAmountFieldSymbol('stable')).toBe('$')
  })

  it('uses fiat symbols for major currencies', () => {
    expect(getSendAmountFieldSymbol('USD')).toBe('$')
    expect(getSendAmountFieldSymbol('ZAR')).toBe('R')
    expect(getSendAmountFieldSymbol('KES')).toBe('KSh')
  })
})

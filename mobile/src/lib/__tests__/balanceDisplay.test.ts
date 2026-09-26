import { getBalanceFontSize, getBalanceTierFontSize, splitBalance } from '../balanceDisplay'

describe('splitBalance', () => {
  it('splits whole units and cents with two decimals', () => {
    expect(splitBalance(24190.32, 'USD')).toEqual({
      sign: '',
      symbol: '$',
      major: '24,190',
      minor: '.32',
      text: '$24,190.32',
    })
    expect(splitBalance(5, 'EUR').text).toBe('€5.00')
    expect(splitBalance(0, 'GBP').text).toBe('£0.00')
  })

  it('uses a true minus for negative remainders', () => {
    const parts = splitBalance(-12.3, 'USD')
    expect(parts.sign).toBe('−')
    expect(parts.text).toBe('−$12.30')
  })

  it('collapses 100M+ to millions or billions without cents', () => {
    expect(splitBalance(250_000_000, 'USD')).toMatchObject({ major: '250.0 Million', minor: '' })
    expect(splitBalance(1_234_000_000, 'USD')).toMatchObject({ major: '1.2 Billion', minor: '' })
  })

  it('treats non-finite values as zero', () => {
    expect(splitBalance(Number.NaN, 'USD').text).toBe('$0.00')
  })
})

describe('balance font sizing', () => {
  const opts = { maxSize: 56, minSize: 28, minorScale: 0.6 }

  it('keeps full size up to 5 whole digits and steps down like the Send amount', () => {
    expect(getBalanceTierFontSize(splitBalance(24190.32, 'USD'), opts)).toBe(56)
    expect(getBalanceTierFontSize(splitBalance(124190.32, 'USD'), opts)).toBe(47)
    expect(getBalanceTierFontSize(splitBalance(1_241_900, 'USD'), opts)).toBe(43)
    expect(getBalanceTierFontSize(splitBalance(99_999_999, 'USD'), opts)).toBe(43)
  })

  it('shrinks further to fit narrow widths but never below the minimum', () => {
    const parts = splitBalance(24190.32, 'USD')
    expect(getBalanceFontSize(parts, 0, opts)).toBe(56)
    expect(getBalanceFontSize(parts, 1000, opts)).toBe(56)
    const narrow = getBalanceFontSize(parts, 240, opts)
    expect(narrow).toBeLessThan(56)
    expect(narrow).toBeGreaterThanOrEqual(28)
    expect(getBalanceFontSize(parts, 40, opts)).toBe(28)
  })

  it('gets smaller as the balance grows at the same width', () => {
    const w = 295
    const small = getBalanceFontSize(splitBalance(4190.32, 'USD'), w, opts)
    const large = getBalanceFontSize(splitBalance(84_190_450.32, 'USD'), w, opts)
    expect(large).toBeLessThan(small)
  })
})

describe('stablecoin symbols', () => {
  it('shows pegged stablecoins with their fiat symbol', () => {
    expect(splitBalance(2500, 'USDC').text).toBe('$2,500.00')
    expect(splitBalance(10, 'EURC').text).toBe('€10.00')
  })
})

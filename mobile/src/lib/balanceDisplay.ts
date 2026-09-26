import { getSendAmountFieldSymbol } from '@easner/shared'

/** Shown instead of the figure when the user hides balances. */
export const BALANCE_MASK = '••••••'

/** Balances of 100M and above collapse to "$1.2 Million" / "$1.2 Billion". */
const COMPACT_FROM = 100_000_000

export type BalanceParts = {
  /** "−" for negative values, otherwise "". */
  sign: string
  symbol: string
  /** Whole units with grouping ("24,190"), or the compact form ("1.2 Billion"). */
  major: string
  /** Fraction including the separator (".32"); empty for compact values. */
  minor: string
  /** The full string, for accessibility and change detection. */
  text: string
}

function symbolFor(currency: string): string {
  const code = currency.toUpperCase()
  if (code === 'USD') return '$'
  if (code === 'EUR') return '€'
  if (code === 'GBP') return '£'
  // Pegged stablecoins show their fiat symbol (USDC → $, EURC → €).
  return getSendAmountFieldSymbol(code)
}

/** Split a balance into symbol, whole units and cents. Always two decimals. */
export function splitBalance(amount: number, currency: string): BalanceParts {
  const value = Number.isFinite(amount) ? amount : 0
  const sign = value < 0 ? '−' : ''
  const abs = Math.abs(value)
  const symbol = symbolFor(currency)

  if (abs >= COMPACT_FROM) {
    const billions = abs / 1_000_000_000
    const major = billions >= 1 ? `${billions.toFixed(1)} Billion` : `${(abs / 1_000_000).toFixed(1)} Million`
    return { sign, symbol, major, minor: '', text: `${sign}${symbol}${major}` }
  }

  const fixed = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const dot = fixed.lastIndexOf('.')
  const major = dot === -1 ? fixed : fixed.slice(0, dot)
  const minor = dot === -1 ? '' : fixed.slice(dot)
  return { sign, symbol, major, minor, text: `${sign}${symbol}${major}${minor}` }
}

export type BalanceFontSizeOptions = {
  maxSize: number
  minSize: number
  /** Size of the cents relative to the whole units (e.g. 0.6). */
  minorScale: number
}

/**
 * Step the font down as whole-unit digits grow — same tiers as the Send amount
 * field (≤5 digits full size, 6 → 55/65, 7–8 → 50/65, then −5/65 per digit).
 */
export function getBalanceTierFontSize(parts: BalanceParts, { maxSize, minSize }: Pick<BalanceFontSizeOptions, 'maxSize' | 'minSize'>): number {
  const digits = parts.major.replace(/[^0-9]/g, '').length || 1
  let tier: number
  if (digits <= 5) tier = 65
  else if (digits === 6) tier = 55
  else if (digits <= 8) tier = 50
  else tier = 50 - (digits - 8) * 5
  return Math.max(minSize, Math.min(maxSize, Math.round((tier / 65) * maxSize)))
}

/** Approximate advance widths in em for Geist Bold with tabular figures. */
const EM_DIGIT = 0.62
const EM_NARROW = 0.3
const EM_SPACE = 0.28
const EM_LETTER = 0.58

function emWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    if (/[0-9]/.test(ch)) w += EM_DIGIT
    else if (ch === ',' || ch === '.') w += EM_NARROW
    else if (ch === ' ') w += EM_SPACE
    else w += EM_LETTER
  }
  return w
}

/**
 * Largest size that fits `availableWidth`, capped by the digit tier. Returns the
 * tier size when the width is not known yet.
 */
export function getBalanceFontSize(
  parts: BalanceParts,
  availableWidth: number,
  options: BalanceFontSizeOptions,
): number {
  const tier = getBalanceTierFontSize(parts, options)
  if (!(availableWidth > 0)) return tier
  const em = emWidth(`${parts.sign}${parts.symbol}${parts.major}`) + emWidth(parts.minor) * options.minorScale
  if (em <= 0) return tier
  const fit = Math.floor(availableWidth / em)
  return Math.max(options.minSize, Math.min(tier, fit))
}

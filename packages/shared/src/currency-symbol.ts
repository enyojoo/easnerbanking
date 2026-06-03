/** Currency symbols for send/receive UI (not ISO codes in rate lines). */

const OVERRIDES: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "$",
  NGN: "₦",
  KES: "KSh",
  GHS: "₵",
  RWF: "R₣",
  ZAR: "R",
  RUB: "₽",
  XOF: "XOF",
  XAF: "XAF",
}

export function getCurrencySymbol(currency: string, fallback = "USD"): string {
  const code = String(currency || fallback).trim().toUpperCase()
  const o = OVERRIDES[code]
  if (o) return o
  try {
    const part = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")
    const sym = part?.value?.trim()
    if (sym && sym !== code) return sym
  } catch {
    // fall through
  }
  return code
}

/** Amount-field prefix on send screens. Pegged stables use fiat symbols, not token tickers. */
export function getSendAmountFieldSymbol(currency: string): string {
  const code = String(currency || "").trim().toUpperCase()
  if (code === "USDT" || code === "USDC" || code === "STABLE") return "$"
  if (code === "EURC") return "€"
  const sym = getCurrencySymbol(currency)
  const trimmed = sym?.trim()
  if (trimmed) return trimmed
  return code
}

/** Multi-char prefixes (e.g. KSh) need a smaller font on send amount headlines. */
export function isWideSendAmountSymbol(symbol: string): boolean {
  return String(symbol ?? "").trim().length > 2
}

export function scaleSendAmountPrefixFontSize(baseFontSize: number, symbol: string): number {
  if (!isWideSendAmountSymbol(symbol)) return baseFontSize
  return Math.max(Math.round(baseFontSize * 0.52), 20)
}

export function scaleSendAmountPrefixLineHeight(baseLineHeight: number, symbol: string): number {
  if (!isWideSendAmountSymbol(symbol)) return baseLineHeight
  return Math.max(Math.round(baseLineHeight * 0.55), 22)
}

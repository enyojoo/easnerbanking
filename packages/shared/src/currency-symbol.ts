/** Currency symbols for send/receive UI (not ISO codes in rate lines). */

const OVERRIDES: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "$",
  NGN: "₦",
  KES: "KSh",
  GHS: "₵",
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

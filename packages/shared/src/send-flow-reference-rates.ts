/**
 * Indicative USD-per-unit for send UI when Noah has no pair.
 * Execution uses Noah / Easner quote paths — not this table.
 */
export const sendFlowReferenceUsdPerUnit: Record<string, number> = {
  USD: 1,
  EUR: 1.09,
  GBP: 1.27,
  NGN: 0.00065,
  KES: 0.0077,
  GHS: 0.065,
  RUB: 0.011,
  XOF: 0.0017,
  ZAR: 0.056,
}

/** 1 from = rate × to via USD hub (matches business send fallback). */
export function referenceConversionRate(fromCurrency: string, toCurrency: string): number {
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  if (from === to) return 1
  const fromPerUsd = 1 / (sendFlowReferenceUsdPerUnit[from] ?? 1)
  const toPerUsd = 1 / (sendFlowReferenceUsdPerUnit[to] ?? 1)
  return toPerUsd / fromPerUsd
}

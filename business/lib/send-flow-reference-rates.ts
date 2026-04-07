/**
 * Indicative USD-per-unit for send UI only (counterparty display math on /send).
 * Execution and terminal charge FX use Noah / Easner quote paths — not this table.
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

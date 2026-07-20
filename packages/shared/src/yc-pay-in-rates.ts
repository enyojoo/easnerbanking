/** Client-side YC pay-in rate helpers (fund balance / local deposit). */

export type YcRateClientRow = {
  from_currency: string
  to_currency: string
  rate: number
  yc_sell?: number | null
  yc_buy?: number | null
  easner_sell?: number | null
  easner_buy?: number | null
}

/** Query param for `/api/fx/yc-rates` when resolving local → USDC pay-in legs. */
export const YC_PAY_IN_RATES_DESTINATION = "USDC"

/**
 * Customer pay-in rate: local fiat per 1 USD credit (easner_sell on local→USDC leg).
 * Mirrors server `findYcPayInLeg` in business/lib/fx/yc-rates.ts.
 */
export function resolveYcPayInCustomerRate(
  rates: readonly YcRateClientRow[],
  localFiat: string,
): number | null {
  const from = localFiat.trim().toUpperCase()
  if (!from) return null
  const row = rates.find((r) => r.from_currency === from && r.to_currency === "USDC")
  const sell = row?.easner_sell
  if (sell != null && Number.isFinite(sell) && sell > 0) return sell
  return null
}

/**
 * YC provider pay-in rate on local→USDC (POST /receive locks yc_buy).
 * Kept as resolveYcPayInYcSellRate for call-site compatibility.
 */
export function resolveYcPayInYcSellRate(
  rates: readonly YcRateClientRow[],
  localFiat: string,
): number | null {
  const from = localFiat.trim().toUpperCase()
  if (!from) return null
  const row = rates.find((r) => r.from_currency === from && r.to_currency === "USDC")
  const buy = row?.yc_buy
  if (buy != null && Number.isFinite(buy) && buy > 0) return buy
  return null
}

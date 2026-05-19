import { fetchBuySellForCurrency } from "./p2p-fetch"
import { pipeline, tierForCurrency, type EasnerLegs } from "./pricing-model"

export type LegMap = Record<string, EasnerLegs & { source: string }>

function rateSyncDebugEnabled(): boolean {
  const v = process.env.RATE_SYNC_DEBUG
  return v === "1" || v === "true"
}

export async function buildEasnerLegs(codes: string[]): Promise<LegMap> {
  const unique = [...new Set(codes)]
  const out: LegMap = {}
  for (const ccy of unique) {
    const { buy, sell, source: src } = await fetchBuySellForCurrency(ccy)
    const t = tierForCurrency(ccy)
    const legs = pipeline(buy, sell, t)
    out[ccy] = { ...legs, source: src }
    if (rateSyncDebugEnabled()) {
      console.error(
        JSON.stringify({
          tag: "RATE_SYNC_DEBUG",
          ts: new Date().toISOString(),
          ccy,
          tier: t.name,
          source: src,
          BUY: buy,
          SELL: sell,
          easner_buy: legs.easner_buy,
          easner_sell: legs.easner_sell,
        }),
      )
    }
  }
  return out
}

/** Cross rate: 1 from = rate × to (USDC bridge). */
export function crossRate(from: string, to: string, legs: LegMap): number | null {
  const a = legs[from]
  const b = legs[to]
  if (!a || !b) return null
  if (!a.easner_buy || !b.easner_sell) return null
  return b.easner_sell / a.easner_buy
}

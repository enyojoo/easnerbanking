import { yellowcardFetch } from "./http"

export type YcRateRow = {
  currency?: string
  code?: string
  buy?: number
  sell?: number
  rateBuy?: number
  rateSell?: number
  [key: string]: unknown
}

export async function listYellowcardRates(): Promise<YcRateRow[]> {
  const res = await yellowcardFetch<{ rates?: YcRateRow[] } | YcRateRow[]>({
    method: "GET",
    path: "/rates",
  })
  if (Array.isArray(res)) return res
  return Array.isArray(res.rates) ? res.rates : []
}

/** Normalize buy/sell from heterogeneous YC rate shapes. */
export function normalizeYcRateRow(row: YcRateRow): {
  currency: string
  buy: number
  sell: number
} | null {
  const currency = String(row.currency ?? row.code ?? "")
    .trim()
    .toUpperCase()
  const buy = Number(row.buy ?? row.rateBuy ?? 0)
  const sell = Number(row.sell ?? row.rateSell ?? 0)
  if (!currency || !Number.isFinite(buy) || buy <= 0 || !Number.isFinite(sell) || sell <= 0) {
    return null
  }
  return { currency, buy, sell }
}

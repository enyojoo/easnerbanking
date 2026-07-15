import { officeFetch } from "@/lib/api-client"

export type YcRateAdminRow = {
  from_currency: string
  to_currency: string
  country_code: string | null
  yc_buy: number | null
  yc_sell: number | null
  easner_buy: number | null
  easner_sell: number | null
  yc_cross_mid: number | null
  rate: number
  margin_bps: number
  source: string
  as_of: string
  status: string
}

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export const ycRatesApi = {
  async list(): Promise<YcRateAdminRow[]> {
    const res = await officeFetch("/api/admin/yc-rates")
    const data = await asJson<{ rates?: YcRateAdminRow[] }>(res)
    return data.rates ?? []
  },

  async syncFromYellowcard(): Promise<{
    updated: number
    skipped: number
    pairs: string[]
    skippedPairs: string[]
  }> {
    const res = await officeFetch("/api/admin/yc-rates/sync", { method: "POST" })
    const data = await asJson<{
      updated?: number
      skipped?: number
      pairs?: string[]
      skippedPairs?: string[]
    }>(res)
    return {
      updated: data.updated ?? 0,
      skipped: data.skipped ?? 0,
      pairs: data.pairs ?? [],
      skippedPairs: data.skippedPairs ?? [],
    }
  },
}

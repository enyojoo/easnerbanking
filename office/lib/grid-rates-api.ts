import { officeFetch } from "@/lib/api-client"

export type GridRateAdminRow = {
  from_currency: string
  to_currency: string
  country_code: string | null
  grid_mid: number
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

export const gridRatesApi = {
  async list(): Promise<GridRateAdminRow[]> {
    const res = await officeFetch("/api/admin/grid-rates")
    const data = await asJson<{ rates?: GridRateAdminRow[] }>(res)
    return data.rates ?? []
  },

  async syncFromGrid(): Promise<{ upserted: number; skipped: number }> {
    const res = await officeFetch("/api/admin/grid-rates/sync", { method: "POST" })
    const data = await asJson<{ upserted?: number; skipped?: number }>(res)
    return {
      upserted: data.upserted ?? 0,
      skipped: data.skipped ?? 0,
    }
  },
}

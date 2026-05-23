import { officeFetch } from "@/lib/api-client"

export type ExchangeRateAdminRow = {
  id?: string
  from_currency: string
  to_currency: string
  rate: number
  fee_type: "free" | "fixed" | "percentage"
  fee_amount: number
  min_amount?: number | null
  max_amount?: number | null
  status: string
  updated_at?: string
  as_of?: string
}

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export const exchangeRatesApi = {
  async list(): Promise<ExchangeRateAdminRow[]> {
    const res = await officeFetch("/api/admin/exchange-rates")
    const data = await asJson<{ rates?: ExchangeRateAdminRow[] }>(res)
    return data.rates ?? []
  },

  async upsert(rates: Omit<ExchangeRateAdminRow, "id" | "updated_at">[]): Promise<void> {
    const res = await officeFetch("/api/admin/exchange-rates", {
      method: "PUT",
      body: JSON.stringify({ rates }),
    })
    await asJson<{ ok?: boolean }>(res)
  },

  async syncFromModel(): Promise<{ updated: number; skipped: number }> {
    const res = await officeFetch("/api/admin/exchange-rates/sync", { method: "POST" })
    const data = await asJson<{ updated?: number; skipped?: number }>(res)
    return { updated: data.updated ?? 0, skipped: data.skipped ?? 0 }
  },
}

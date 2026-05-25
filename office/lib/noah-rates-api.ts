import { officeFetch } from "@/lib/api-client"
import { NOAH_SEND_RATES_STALE_MS } from "@easner/shared"

export type NoahRateAdminRow = {
  id?: string
  from_currency: string
  to_currency: string
  country_code?: string | null
  noah_mid: number
  rate: number
  margin_bps: number
  source: string
  as_of: string
  fee_type: "free" | "fixed" | "percentage"
  fee_amount: number
  min_amount?: number | null
  max_amount?: number | null
  status: string
  updated_at?: string
}

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export function isNoahRateRowStale(row: Pick<NoahRateAdminRow, "as_of" | "status">): boolean {
  if (row.status !== "active") return true
  const asOfMs = new Date(row.as_of).getTime()
  if (!Number.isFinite(asOfMs) || asOfMs <= 0) return true
  return Date.now() - asOfMs > NOAH_SEND_RATES_STALE_MS
}

export const noahRatesApi = {
  async list(): Promise<NoahRateAdminRow[]> {
    const res = await officeFetch("/api/admin/noah-rates")
    const data = await asJson<{ rates?: NoahRateAdminRow[] }>(res)
    return data.rates ?? []
  },

  async upsert(
    rates: Array<{
      from_currency: string
      to_currency: string
      rate: number
      noah_mid?: number
      margin_bps?: number
      fee_type: "free" | "fixed" | "percentage"
      fee_amount: number
      min_amount?: number | null
      max_amount?: number | null
      status: string
    }>,
  ): Promise<void> {
    const res = await officeFetch("/api/admin/noah-rates", {
      method: "PUT",
      body: JSON.stringify({ rates }),
    })
    await asJson<{ ok?: boolean }>(res)
  },

  async syncFromNoah(): Promise<{
    updated: number
    skipped: number
    pairs: string[]
    skippedPairs: string[]
  }> {
    const res = await officeFetch("/api/admin/noah-rates/sync", { method: "POST" })
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

import { officeFetch } from "@/lib/api-client"

export type ProcessingFeeScheduleScope = "fiat_bank" | "fiat_mobile_money" | "crypto"

export type ProcessingFeeScheduleRow = {
  id?: string
  scope: ProcessingFeeScheduleScope
  country_code: string | null
  currency_code: string | null
  asset_code: string | null
  country_name?: string | null
  currency_name?: string | null
  asset_name?: string | null
  pay_in_bps: number
  pay_out_bps: number
  cross_border_bps: number
  updated_at?: string
}

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export const processingFeeScheduleApi = {
  async list(scope: ProcessingFeeScheduleScope): Promise<ProcessingFeeScheduleRow[]> {
    const res = await officeFetch(`/api/admin/processing-fee-schedule?scope=${encodeURIComponent(scope)}`)
    const data = await asJson<{ fees?: ProcessingFeeScheduleRow[] }>(res)
    return data.fees ?? []
  },

  async upsert(
    fees: Array<{
      scope: ProcessingFeeScheduleScope
      country_code?: string | null
      currency_code?: string | null
      asset_code?: string | null
      pay_in_bps: number
      pay_out_bps: number
      cross_border_bps: number
    }>,
  ): Promise<void> {
    const res = await officeFetch("/api/admin/processing-fee-schedule", {
      method: "PUT",
      body: JSON.stringify({ fees }),
    })
    await asJson<{ ok?: boolean }>(res)
  },
}

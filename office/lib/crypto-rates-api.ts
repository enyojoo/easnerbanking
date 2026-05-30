import { officeFetch } from "@/lib/api-client"

export type CryptoRateAdminRow = {
  id?: string
  from_currency: string
  to_currency: string
  receive_network: string
  lifi_mid: number
  rate: number
  margin_bps: number
  source: string
  as_of: string
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

export const cryptoRatesApi = {
  async list(): Promise<CryptoRateAdminRow[]> {
    const res = await officeFetch("/api/admin/crypto-rates")
    const data = await asJson<{ rates?: CryptoRateAdminRow[] }>(res)
    return data.rates ?? []
  },

  async upsert(
    rates: Array<{
      from_currency: string
      to_currency: string
      receive_network: string
      rate: number
      lifi_mid?: number
      margin_bps?: number
      status: string
    }>,
  ): Promise<void> {
    const res = await officeFetch("/api/admin/crypto-rates", {
      method: "PUT",
      body: JSON.stringify({ rates }),
    })
    await asJson<{ ok?: boolean }>(res)
  },

  async syncFromLifi(): Promise<{
    updated: number
    skipped: number
    skippedPairs: string[]
  }> {
    const res = await officeFetch("/api/admin/crypto-rates/sync", { method: "POST" })
    const data = await asJson<{
      updated?: number
      skipped?: number
      skippedPairs?: string[]
    }>(res)
    return {
      updated: data.updated ?? 0,
      skipped: data.skipped ?? 0,
      skippedPairs: data.skippedPairs ?? [],
    }
  },
}

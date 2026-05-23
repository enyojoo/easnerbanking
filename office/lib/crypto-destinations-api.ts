import { officeFetch } from "@/lib/api-client"

export type CryptoDestinationAdminRow = {
  id: string
  asset_code: string
  asset_name: string
  networks: unknown
  country_code: string | null
  enabled: boolean
  sort_order: number | null
  provider_routing: unknown
  metadata: unknown
  updated_at: string
  updated_by: string | null
}

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export const cryptoDestinationsApi = {
  async list(): Promise<CryptoDestinationAdminRow[]> {
    const res = await officeFetch("/api/admin/crypto-destinations")
    const data = await asJson<{ destinations?: CryptoDestinationAdminRow[] }>(res)
    return data.destinations ?? []
  },

  async patch(
    id: string,
    body: {
      enabled?: boolean
      sort_order?: number | null
      asset_name?: string
      networks?: unknown
      provider_routing?: unknown
      metadata?: Record<string, unknown> | null
    },
  ): Promise<CryptoDestinationAdminRow> {
    const res = await officeFetch(`/api/admin/crypto-destinations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
    const data = await asJson<{ destination: CryptoDestinationAdminRow }>(res)
    return data.destination
  },
}

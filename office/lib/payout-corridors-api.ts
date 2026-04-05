import { officeFetch } from "@/lib/api-client"

export type PayoutCorridorAdminRow = {
  id: string
  rail: string
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
  enabled: boolean
  sort_order: number | null
  /** MM network labels shown to users; map to rails in code when calling providers. */
  providers: unknown
  /** Optional ops hint (e.g. noah); null = unspecified. Does not replace runtime capability checks. */
  settlement_backend: string | null
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

export const payoutCorridorsApi = {
  async list(): Promise<PayoutCorridorAdminRow[]> {
    const res = await officeFetch("/api/admin/payout-corridors")
    const data = await asJson<{ corridors?: PayoutCorridorAdminRow[] }>(res)
    return data.corridors ?? []
  },

  async patch(
    id: string,
    body: {
      enabled?: boolean
      sort_order?: number | null
      providers?: unknown
      country_name?: string
      settlement_backend?: string | null
      metadata?: Record<string, unknown> | null
    },
  ): Promise<PayoutCorridorAdminRow> {
    const res = await officeFetch(`/api/admin/payout-corridors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
    const data = await asJson<{ corridor: PayoutCorridorAdminRow }>(res)
    return data.corridor
  },
}

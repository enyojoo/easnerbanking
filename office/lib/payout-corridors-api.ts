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
  provider_routing?: unknown
  fields_schema?: unknown
  provider_health?: Record<string, "ok" | "unavailable">
  /** Live or synced Yellowcard send channel on this corridor rail. */
  yc_send_available?: boolean
  /** Live or synced Yellowcard deposit channel on this corridor rail. */
  yc_receive_available?: boolean
  /** Live or synced Grid send on this corridor rail. */
  grid_send_available?: boolean
  /** Live or synced Grid local pay-in on this corridor rail. */
  grid_receive_available?: boolean
  /** Live Noah sell channel for this country + currency. */
  noah_sell_available?: boolean
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
  async list(opts?: { annotateProviders?: boolean }): Promise<PayoutCorridorAdminRow[]> {
    const q = opts?.annotateProviders ? "?annotateProviders=true" : ""
    const res = await officeFetch(`/api/admin/payout-corridors${q}`)
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
      provider_routing?: unknown
      fields_schema?: Record<string, unknown> | null
    },
  ): Promise<PayoutCorridorAdminRow> {
    const res = await officeFetch(`/api/admin/payout-corridors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
    const data = await asJson<{ corridor: PayoutCorridorAdminRow }>(res)
    return data.corridor
  },

  async syncGridCorridors(): Promise<{
    provision?: { inserted: number; updated: number; skipped: number; targets: number }
    schemas: {
      noah: { updated: number; skipped: number }
      yellowcard: { updated: number; skipped: number }
      grid: { updated: number; skipped: number }
    }
  }> {
    const res = await officeFetch("/api/admin/grid-schemas/sync", { method: "POST" })
    return asJson(res)
  },
}

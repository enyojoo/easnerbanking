import type { SupabaseClient } from "@supabase/supabase-js"

export type PayoutCorridorUpsertRow = {
  rail: string
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
  enabled?: boolean
  provider_routing?: unknown
  providers?: unknown
  sort_order?: number | null
}

/** Insert or update by natural key (works even before unique index migration is applied). */
export async function upsertPayoutCorridor(
  admin: SupabaseClient,
  row: PayoutCorridorUpsertRow,
): Promise<{ ok: boolean; error?: string }> {
  const { data: existing, error: findErr } = await admin
    .from("payout_corridors")
    .select("id")
    .eq("rail", row.rail)
    .eq("country_code", row.country_code)
    .maybeSingle()

  if (findErr) return { ok: false, error: findErr.message }

  if (existing?.id) {
    const { error } = await admin
      .from("payout_corridors")
      .update({
        country_name: row.country_name,
        currency_code: row.currency_code,
        currency_name: row.currency_name,
        ...(row.enabled !== undefined ? { enabled: row.enabled } : {}),
        ...(row.provider_routing !== undefined ? { provider_routing: row.provider_routing } : {}),
        ...(row.providers !== undefined ? { providers: row.providers } : {}),
        ...(row.sort_order !== undefined ? { sort_order: row.sort_order } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
    return error ? { ok: false, error: error.message } : { ok: true }
  }

  const { error } = await admin.from("payout_corridors").insert({
    ...row,
    enabled: row.enabled ?? false,
    provider_routing: row.provider_routing ?? [],
    updated_at: new Date().toISOString(),
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

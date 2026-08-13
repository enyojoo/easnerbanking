import type { SupabaseClient } from "@supabase/supabase-js"
import { isCustomerFacingFiatCorridorLive } from "@easner/shared"

export type OrphanPayoutCorridorCleanupResult = {
  ok: boolean
  disabled: number
  error?: string
}

/** Disable enabled corridors with no Office payout or pay-in provider selected. */
export async function disableOrphanPayoutCorridors(
  admin: SupabaseClient,
): Promise<OrphanPayoutCorridorCleanupResult> {
  const { data: rows, error } = await admin
    .from("payout_corridors")
    .select("id,enabled,provider_routing,metadata")
    .eq("enabled", true)

  if (error) return { ok: false, disabled: 0, error: error.message }

  let disabled = 0
  const now = new Date().toISOString()

  for (const row of rows ?? []) {
    const live = isCustomerFacingFiatCorridorLive({
      enabled: row.enabled,
      provider_routing: row.provider_routing,
      metadata: row.metadata,
    })
    if (live) continue

    const { error: upErr } = await admin
      .from("payout_corridors")
      .update({ enabled: false, updated_at: now })
      .eq("id", row.id)
    if (!upErr) disabled++
  }

  return { ok: true, disabled }
}

const LIVE_FLAG_KEYS = [
  "grid_send_enabled",
  "grid_receive_enabled",
  "yc_send_enabled",
  "yc_receive_enabled",
  "noah_send_enabled",
  "noah_receive_enabled",
] as const

export type CorridorLiveFlagSyncResult = {
  ok: boolean
  cleared: number
  error?: string
}

/** Clear live-send/receive flags on disabled corridor rows so they cannot leak into catalogs. */
export async function syncCorridorLiveFlagsWithEnabled(
  admin: SupabaseClient,
): Promise<CorridorLiveFlagSyncResult> {
  const { data: rows, error } = await admin
    .from("payout_corridors")
    .select("id,metadata")
    .eq("enabled", false)

  if (error) return { ok: false, cleared: 0, error: error.message }

  let cleared = 0
  const now = new Date().toISOString()

  for (const row of rows ?? []) {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    let dirty = false
    for (const key of LIVE_FLAG_KEYS) {
      if (meta[key] === true) {
        delete meta[key]
        dirty = true
      }
    }
    if (!dirty) continue
    const { error: upErr } = await admin
      .from("payout_corridors")
      .update({ metadata: meta, updated_at: now })
      .eq("id", row.id)
    if (!upErr) cleared++
  }

  return { ok: true, cleared }
}

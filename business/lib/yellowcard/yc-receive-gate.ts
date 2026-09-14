import type { SupabaseClient } from "@supabase/supabase-js"
import { readCorridorSurfaceRouting, type CorridorRoutingSurface } from "@easner/shared"
import { loadUserRoutingSurface } from "@/lib/corridor-routing-surface"

type CorridorMeta = Record<string, unknown>

/** Provider capability: Yellowcard supports local pay-in on this corridor (from YC sync). */
export function corridorSupportsYcReceive(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as CorridorMeta
  return meta.yc_receive === true
}

/** Provider capability: Noah supports local pay-in on this corridor (when synced). */
export function corridorSupportsNoahReceive(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as CorridorMeta
  return meta.noah_receive === true
}

/** Provider capability: Grid supports local pay-in on this corridor (from Grid sync). */
export function corridorSupportsGridReceive(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as CorridorMeta
  return meta.grid_receive === true
}

/** True when any provider supports local fiat pay-in on this corridor. */
export function corridorSupportsLocalPayIn(metadata: unknown): boolean {
  return (
    corridorSupportsYcReceive(metadata) ||
    corridorSupportsNoahReceive(metadata) ||
    corridorSupportsGridReceive(metadata)
  )
}

/** Office toggle: local pay-in is enabled for customers on this corridor. */
export function corridorYcReceiveEnabled(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as CorridorMeta
  return meta.yc_receive_enabled === true
}

/** Office toggle: Noah local pay-in enabled (when corridor has noah_receive). */
export function corridorNoahReceiveEnabled(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as CorridorMeta
  return meta.noah_receive_enabled === true
}

/** Office toggle: Grid local pay-in enabled (when corridor has grid_receive). */
export function corridorGridReceiveEnabled(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as CorridorMeta
  return meta.grid_receive === true && meta.grid_receive_enabled === true
}

/** Office toggle on for any supported local pay-in provider. */
export function corridorLocalPayInEnabled(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as CorridorMeta
  if (meta.yc_receive === true && meta.yc_receive_enabled === true) return true
  if (meta.noah_receive === true && meta.noah_receive_enabled === true) return true
  if (meta.grid_receive === true && meta.grid_receive_enabled === true) return true
  return false
}

/**
 * Whether any enabled corridor in the payer country allows YC local pay-in.
 * Used for cross-border "Through local currency" and residence-based flows.
 */
export async function isYcLocalPayInEnabledForCountry(
  admin: SupabaseClient,
  countryCode: string,
): Promise<boolean> {
  const cc = countryCode.trim().toUpperCase()
  if (!cc) return false

  const { data } = await admin
    .from("payout_corridors")
    .select("metadata,enabled")
    .eq("country_code", cc)
    .eq("enabled", true)

  for (const row of data ?? []) {
    if (corridorYcReceiveEnabled(row.metadata)) return true
  }
  return false
}

/**
 * Whether a specific corridor allows YC local pay-in (enabled corridor + office toggle).
 */
export async function isYcLocalPayInEnabledForCorridor(
  admin: SupabaseClient,
  input: {
    countryCode: string
    currencyCode: string
    rail?: "bank_transfer" | "mobile_money"
    userId?: string | null
    surface?: CorridorRoutingSurface
  },
): Promise<boolean> {
  const country = input.countryCode.trim().toUpperCase()
  const currency = input.currencyCode.trim().toUpperCase()
  if (!country || !currency) return false

  let q = admin
    .from("payout_corridors")
    .select("metadata,enabled,rail,provider_routing")
    .eq("country_code", country)
    .eq("currency_code", currency)
    .eq("enabled", true)

  if (input.rail) {
    q = q.eq("rail", input.rail)
  }

  const { data } = await q.limit(10)
  const surface =
    input.surface ?? (await loadUserRoutingSurface(admin, input.userId))
  for (const row of data ?? []) {
    const overlay = readCorridorSurfaceRouting(
      { provider_routing: row.provider_routing, metadata: row.metadata },
      surface,
    )
    if (overlay.pay_in === "yellowcard") return true
  }
  return false
}

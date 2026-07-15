import type { SupabaseClient } from "@supabase/supabase-js"

type CorridorMeta = Record<string, unknown>

/** Provider capability: Yellowcard supports local pay-in on this corridor. */
export function corridorSupportsYcReceive(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as CorridorMeta
  if (meta.yc_receive === true) return true
  // Legacy rows: receive sync used to set yc_receive_enabled before yc_receive existed.
  if (meta.yc_receive == null && meta.yc_receive_enabled === true) return true
  return false
}

/** Office toggle: local pay-in is enabled for customers on this corridor. */
export function corridorYcReceiveEnabled(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as CorridorMeta
  return meta.yc_receive_enabled === true
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
  },
): Promise<boolean> {
  const country = input.countryCode.trim().toUpperCase()
  const currency = input.currencyCode.trim().toUpperCase()
  if (!country || !currency) return false

  let q = admin
    .from("payout_corridors")
    .select("metadata,enabled,rail")
    .eq("country_code", country)
    .eq("currency_code", currency)
    .eq("enabled", true)

  if (input.rail) {
    q = q.eq("rail", input.rail)
  }

  const { data } = await q.limit(10)
  for (const row of data ?? []) {
    if (corridorYcReceiveEnabled(row.metadata)) return true
  }
  return false
}

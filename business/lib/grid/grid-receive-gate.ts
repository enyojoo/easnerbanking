import type { SupabaseClient } from "@supabase/supabase-js"
export {
  corridorGridReceiveEnabled,
  corridorSupportsGridReceive,
} from "@/lib/yellowcard/yc-receive-gate"

/** Extend shared local pay-in check with Grid. */
export function corridorSupportsGridLocalPayIn(
  metadata: unknown,
): boolean {
  const meta = (metadata ?? {}) as Record<string, unknown>
  return meta.grid_receive === true
}

export async function isGridLocalPayInEnabledForCountry(
  admin: SupabaseClient,
  countryCode: string,
): Promise<boolean> {
  const { corridorGridReceiveEnabled } = await import("@/lib/yellowcard/yc-receive-gate")
  const cc = countryCode.trim().toUpperCase()
  if (!cc) return false

  const { data } = await admin
    .from("payout_corridors")
    .select("metadata,enabled")
    .eq("country_code", cc)
    .eq("enabled", true)

  for (const row of data ?? []) {
    if (corridorGridReceiveEnabled(row.metadata)) return true
  }
  return false
}

export async function isGridLocalPayInEnabledForCorridor(
  admin: SupabaseClient,
  input: {
    countryCode: string
    currencyCode: string
    rail?: "bank_transfer" | "mobile_money"
  },
): Promise<boolean> {
  const { corridorGridReceiveEnabled } = await import("@/lib/yellowcard/yc-receive-gate")
  const country = input.countryCode.trim().toUpperCase()
  const currency = input.currencyCode.trim().toUpperCase()
  if (!country || !currency) return false

  let q = admin
    .from("payout_corridors")
    .select("metadata,enabled,rail")
    .eq("country_code", country)
    .eq("currency_code", currency)
    .eq("enabled", true)

  if (input.rail) q = q.eq("rail", input.rail)

  const { data } = await q.limit(10)
  for (const row of data ?? []) {
    if (corridorGridReceiveEnabled(row.metadata)) return true
  }
  return false
}

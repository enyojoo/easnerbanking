import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveUsPayInModeFromCorridor, type UsPayInMode } from "@easner/shared"

export async function loadUsUsdBankPayInMode(admin: SupabaseClient): Promise<UsPayInMode> {
  const { data } = await admin
    .from("payout_corridors")
    .select("metadata,enabled")
    .eq("country_code", "US")
    .eq("currency_code", "USD")
    .eq("rail", "bank_transfer")
    .limit(1)
  const row = Array.isArray(data) ? data[0] : data
  return resolveUsPayInModeFromCorridor(row ?? null)
}

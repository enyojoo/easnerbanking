import type { SupabaseClient } from "@supabase/supabase-js"
import { listYcRates, type YcRateRow } from "@/lib/fx/yc-rates"

export type YcRateAdminRow = YcRateRow & {
  updated_at?: string
}

export async function listYcRatesAdmin(admin: SupabaseClient): Promise<YcRateAdminRow[]> {
  return listYcRates(admin, { status: "all" })
}

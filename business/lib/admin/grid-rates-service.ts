import type { SupabaseClient } from "@supabase/supabase-js"
import { listGridRates, type GridRateRow } from "@/lib/fx/grid-rates"

export type GridRateAdminRow = GridRateRow & {
  updated_at?: string
}

export async function listGridRatesAdmin(admin: SupabaseClient): Promise<GridRateAdminRow[]> {
  return listGridRates(admin, { status: "all" }, { backgroundRefresh: false })
}

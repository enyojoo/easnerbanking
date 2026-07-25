import type { SupabaseClient } from "@supabase/supabase-js"

export async function isPayrollV2Enabled(
  admin: SupabaseClient,
  businessId: string,
): Promise<boolean> {
  if (process.env.PAYROLL_V2_ENABLED === "true") return true
  const { data } = await admin
    .from("payroll_settings")
    .select("enabled")
    .eq("business_id", businessId)
    .maybeSingle()
  if (typeof data?.enabled === "boolean") return data.enabled
  return process.env.NODE_ENV !== "production"
}

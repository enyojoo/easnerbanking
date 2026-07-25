import type { SupabaseClient } from "@supabase/supabase-js"

export async function enforcePayrollRateLimit(
  admin: SupabaseClient,
  key: string,
  options: { limit: number; windowSeconds: number },
): Promise<boolean> {
  const { data, error } = await admin.rpc("consume_payroll_rate_limit", {
    p_rate_key: key,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  })
  if (error) {
    // Keep local/dev environments usable before the additive migration is applied.
    if (error.code === "42883" || error.code === "PGRST202") return true
    return false
  }
  return data === true
}

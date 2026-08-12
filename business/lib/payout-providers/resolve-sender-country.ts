import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessCountryIso2 } from "@/lib/grid/business-profile-shell"

/** Sender residence/registration ISO2 for payout Grid digital-asset gating. */
export async function resolvePayoutSenderCountryCode(
  admin: SupabaseClient,
  input: { businessId?: string | null; userId?: string | null },
): Promise<string | null> {
  try {
    if (input.businessId) {
      const { data } = await admin
        .from("businesses")
        .select("country")
        .eq("id", input.businessId)
        .maybeSingle()
      return resolveBusinessCountryIso2(data?.country ?? null)
    }
    if (input.userId) {
      const { data } = await admin
        .from("users")
        .select("residence_country")
        .eq("id", input.userId)
        .maybeSingle()
      const code = String(data?.residence_country ?? "")
        .trim()
        .toUpperCase()
      return /^[A-Z]{2}$/.test(code) ? code : null
    }
  } catch {
    return null
  }
  return null
}

import type { SupabaseClient } from "@supabase/supabase-js"

export type OnlinePaymentsEnabledResult = {
  /** Business-level master switch for card/bank collections. Defaults true when no row exists. */
  enabled: boolean
}

/**
 * Read the business master switch for online (card/bank) collections.
 * Missing checkout settings row → enabled (new businesses).
 */
export async function resolveOnlinePaymentsEnabled(
  admin: SupabaseClient,
  businessId: string,
): Promise<OnlinePaymentsEnabledResult> {
  const { data } = await admin
    .from("business_checkout_settings")
    .select("online_payments_enabled")
    .eq("business_id", businessId)
    .maybeSingle()

  if (!data) {
    return { enabled: true }
  }

  return { enabled: data.online_payments_enabled !== false }
}

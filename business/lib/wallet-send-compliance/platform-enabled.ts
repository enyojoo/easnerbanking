import type { SupabaseClient } from "@supabase/supabase-js"

/** Office Platform Configuration → system_settings key */
export const WALLET_SEND_COMPLIANCE_PLATFORM_KEY = "wallet_send_compliance_enabled"

function parseSettingBool(value: unknown, fallback: boolean): boolean {
  if (value == null) return fallback
  const s = String(value).trim().toLowerCase()
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true
  if (s === "false" || s === "0" || s === "no" || s === "off") return false
  return fallback
}

/** Global kill switch from Office platform settings. Defaults to enabled when unset. */
export async function isWalletSendCompliancePlatformEnabled(
  admin: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", WALLET_SEND_COMPLIANCE_PLATFORM_KEY)
    .maybeSingle()

  if (error) {
    console.error("[wallet-send-compliance] platform setting read failed:", error.message)
    return true
  }

  return parseSettingBool(data?.value, true)
}

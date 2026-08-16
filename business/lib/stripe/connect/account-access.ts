import type { SupabaseClient } from "@supabase/supabase-js"

/** True when the platform key can no longer retrieve this connected account. */
export function isStripeConnectAccountInaccessibleError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const record = error as { code?: unknown; message?: unknown }
  if (record.code === "account_invalid") return true
  const message = String(record.message ?? "")
  return (
    message.includes("does not have access to account") ||
    message.includes("Application access may have been revoked")
  )
}

export async function clearStaleConnectAccountRow(
  admin: SupabaseClient,
  businessId: string,
): Promise<void> {
  await admin.from("business_stripe_connect_accounts").delete().eq("business_id", businessId)
}

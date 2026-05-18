import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahCustomerScope } from "./customer-id"
import { isNoahVerificationApproved } from "./noah-tier-guards"

/**
 * True when verification is approved but USD/EUR fiat VA ids are not mirrored on users/businesses.
 */
export async function needsNoahFiatVirtualAccountProvision(
  admin: SupabaseClient,
  opts: {
    scope: NoahCustomerScope
    subjectUserId: string
    subjectBusinessId: string | null
  },
): Promise<boolean> {
  const approved = await isNoahVerificationApproved(admin, {
    scope: opts.scope,
    subjectUserId: opts.subjectUserId,
    subjectBusinessId: opts.subjectBusinessId,
  })
  if (!approved) return false

  if (opts.scope === "business" && opts.subjectBusinessId) {
    const { data: biz } = await admin
      .from("businesses")
      .select("noah_usd_virtual_account_id,noah_eur_virtual_account_id")
      .eq("id", opts.subjectBusinessId)
      .maybeSingle()
    return !biz?.noah_usd_virtual_account_id || !biz?.noah_eur_virtual_account_id
  }

  const { data: user } = await admin
    .from("users")
    .select("noah_usd_virtual_account_id,noah_eur_virtual_account_id")
    .eq("id", opts.subjectUserId)
    .maybeSingle()
  return !user?.noah_usd_virtual_account_id || !user?.noah_eur_virtual_account_id
}

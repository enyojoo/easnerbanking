import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import type { NoahCustomerScope } from "./customer-id"
import { provisionNoahArtifactsForCustomer } from "./provisioning"
import { scheduleTurnkeyWalletsAfterKycApproved } from "@/lib/wallet/turnkey-provisioning"

/**
 * After Noah KYC/KYB is approved: fetch payment methods / liquidation addresses and enqueue Turnkey wallets.
 * Used by sync-status and webhooks (org owner resolved for business scope).
 */
export async function provisionNoahAfterVerificationApproved(opts: {
  admin: SupabaseClient
  scope: NoahCustomerScope
  noahCustomerId: string
  subjectUserId: string
  subjectBusinessId: string | null
}): Promise<Record<string, unknown>> {
  const { admin, scope, noahCustomerId, subjectBusinessId } = opts
  let subjectUserId = opts.subjectUserId

  if (scope === "business" && subjectBusinessId) {
    const ownerId = await resolveBusinessOrgOwnerUserId(admin, subjectBusinessId)
    if (ownerId) subjectUserId = ownerId
  }

  await scheduleTurnkeyWalletsAfterKycApproved({
    scope,
    subjectUserId,
    subjectBusinessId,
    noahCustomerId,
  })

  const provisioned = await provisionNoahArtifactsForCustomer({
    subjectUserId,
    subjectBusinessId,
    noahCustomerId,
    scope,
    admin,
  })

  return provisioned as Record<string, unknown>
}

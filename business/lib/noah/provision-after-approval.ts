import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import type { NoahCustomerScope } from "./customer-id"
import type { NoahAccountContext } from "./resolve-account-context"
import { provisionNoahArtifactsForCustomer } from "./provisioning"
import { trySyncTurnkeyDepositVaultsIfNeeded } from "@/lib/wallet/sync-deposit-vaults"
import { scheduleTurnkeyWalletsAfterKycApproved } from "@/lib/wallet/turnkey-provisioning"

function buildAccountContext(opts: {
  scope: NoahCustomerScope
  noahCustomerId: string
  subjectUserId: string
  subjectBusinessId: string | null
}): NoahAccountContext {
  return {
    scope: opts.scope,
    customerType: opts.scope === "business" ? "Business" : "Individual",
    noahCustomerId: opts.noahCustomerId,
    subjectBusinessId: opts.subjectBusinessId,
    subjectUserId: opts.subjectUserId,
  }
}

/**
 * After Noah KYC/KYB is approved: enqueue Turnkey vault jobs, drain them inline, then provision Noah VAs.
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

  const accountCtx = buildAccountContext({
    scope,
    noahCustomerId,
    subjectUserId,
    subjectBusinessId,
  })
  await trySyncTurnkeyDepositVaultsIfNeeded(admin, accountCtx)

  const provisioned = await provisionNoahArtifactsForCustomer({
    subjectUserId,
    subjectBusinessId,
    noahCustomerId,
    scope,
    admin,
  })

  return provisioned as Record<string, unknown>
}

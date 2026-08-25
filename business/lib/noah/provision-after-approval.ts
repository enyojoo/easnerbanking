import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import type { NoahCustomerScope } from "./customer-id"
import type { NoahAccountContext } from "./resolve-account-context"
import { provisionNoahArtifactsForCustomer } from "./provisioning"
import { trySyncTurnkeyDepositVaultsIfNeeded } from "@/lib/wallet/sync-deposit-vaults"
import { ensureTurnkeySubOrgForEasnerOwner } from "@/lib/wallet/ensure-turnkey-sub-org"
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

  const { data: userRow } = await admin
    .from("users")
    .select("email,full_name")
    .eq("id", subjectUserId)
    .maybeSingle()
  const userEmail = String(userRow?.email ?? "").trim() || null
  const displayName = String(userRow?.full_name ?? "").trim() || null

  const subOrg = await ensureTurnkeySubOrgForEasnerOwner({
    admin,
    scope: scope === "business" ? "business" : "individual",
    subjectUserId,
    subjectBusinessId,
    noahCustomerId,
    userEmail,
    displayName,
  })
  if (!subOrg.ok) {
    console.warn("[provisionNoahAfterVerificationApproved] Turnkey sub-org:", subOrg.reason)
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

  if (scope === "business" || subjectBusinessId) {
    return {
      skipped: true,
      reason: "business_uses_grid_not_noah",
      turnkeySubOrgReady: subOrg.ok,
      turnkeySubOrgError: subOrg.ok ? null : subOrg.reason,
      turnkeySubOrganizationId: subOrg.ok ? subOrg.subOrganizationId : null,
    }
  }

  const provisioned = await provisionNoahArtifactsForCustomer({
    subjectUserId,
    subjectBusinessId,
    noahCustomerId,
    scope,
    admin,
  })

  return {
    ...(provisioned as Record<string, unknown>),
    turnkeySubOrgReady: subOrg.ok,
    turnkeySubOrgError: subOrg.ok ? null : subOrg.reason,
    turnkeySubOrganizationId: subOrg.ok ? subOrg.subOrganizationId : null,
  }
}

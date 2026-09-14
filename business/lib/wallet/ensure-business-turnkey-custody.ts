import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { ensureTurnkeySubOrgForEasnerOwner } from "@/lib/wallet/ensure-turnkey-sub-org"
import { trySyncTurnkeyDepositVaultsIfNeeded } from "@/lib/wallet/sync-deposit-vaults"
import { scheduleTurnkeyWalletsAfterKycApproved } from "@/lib/wallet/turnkey-provisioning"

/**
 * Shared post-KYB custody bootstrap for Grid and Bridge.
 * Either rail can finish first; this is idempotent so they do not clash.
 */
export async function ensureBusinessTurnkeyCustody(input: {
  admin: SupabaseClient
  businessId: string
  subjectUserId: string
}): Promise<{
  subjectUserId: string
  subOrg: Awaited<ReturnType<typeof ensureTurnkeySubOrgForEasnerOwner>>
}> {
  let subjectUserId = input.subjectUserId
  const ownerId = await resolveBusinessOrgOwnerUserId(input.admin, input.businessId)
  if (ownerId) subjectUserId = ownerId

  const { data: biz } = await input.admin
    .from("businesses")
    .select("name,support_email")
    .eq("id", input.businessId)
    .maybeSingle()
  const { data: ownerUser } = await input.admin
    .from("users")
    .select("email,full_name")
    .eq("id", subjectUserId)
    .maybeSingle()

  const userEmail =
    String(biz?.support_email ?? "").trim() || String(ownerUser?.email ?? "").trim() || null
  const displayName = String(biz?.name ?? ownerUser?.full_name ?? "").trim() || null

  const subOrg = await ensureTurnkeySubOrgForEasnerOwner({
    admin: input.admin,
    scope: "business",
    subjectUserId,
    subjectBusinessId: input.businessId,
    noahCustomerId: "",
    userEmail,
    displayName,
  })
  if (!subOrg.ok) {
    console.warn("[ensureBusinessTurnkeyCustody] Turnkey sub-org:", subOrg.reason)
  }

  await scheduleTurnkeyWalletsAfterKycApproved({
    scope: "business",
    subjectUserId,
    subjectBusinessId: input.businessId,
    noahCustomerId: "",
  })

  const accountCtx: NoahAccountContext = {
    scope: "business",
    customerType: "Business",
    noahCustomerId: "",
    subjectBusinessId: input.businessId,
    subjectUserId,
  }
  await trySyncTurnkeyDepositVaultsIfNeeded(input.admin, accountCtx)

  return { subjectUserId, subOrg }
}

/** Consumer custody bootstrap so Bridge VAs can target the user's Turnkey vaults. */
export async function ensureIndividualTurnkeyCustody(input: {
  admin: SupabaseClient
  userId: string
}): Promise<{
  subjectUserId: string
  subOrg: Awaited<ReturnType<typeof ensureTurnkeySubOrgForEasnerOwner>>
}> {
  const { data: user } = await input.admin
    .from("users")
    .select("email,full_name,noah_customer_id")
    .eq("id", input.userId)
    .maybeSingle()

  const userEmail = String(user?.email ?? "").trim() || null
  const displayName = String(user?.full_name ?? "").trim() || null
  const noahCustomerId = String(user?.noah_customer_id ?? "").trim()

  const subOrg = await ensureTurnkeySubOrgForEasnerOwner({
    admin: input.admin,
    scope: "individual",
    subjectUserId: input.userId,
    subjectBusinessId: null,
    noahCustomerId,
    userEmail,
    displayName,
  })
  if (!subOrg.ok) {
    console.warn("[ensureIndividualTurnkeyCustody] Turnkey sub-org:", subOrg.reason)
  }

  await scheduleTurnkeyWalletsAfterKycApproved({
    scope: "individual",
    subjectUserId: input.userId,
    subjectBusinessId: null,
    noahCustomerId,
  })

  const accountCtx: NoahAccountContext = {
    scope: "individual",
    customerType: "Individual",
    noahCustomerId,
    subjectBusinessId: null,
    subjectUserId: input.userId,
  }
  await trySyncTurnkeyDepositVaultsIfNeeded(input.admin, accountCtx)

  return { subjectUserId: input.userId, subOrg }
}

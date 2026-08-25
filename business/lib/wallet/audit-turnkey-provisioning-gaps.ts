import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureParentSubOrgProvisioningPolicy } from "@/lib/turnkey/ensure-parent-provisioning-policy"

export type TurnkeyProvisioningGapRow = {
  ownerType: "business" | "individual"
  ownerRef: string
  label: string | null
  partnerCustomerId: string | null
  verificationStatus: string | null
  awaitingSubOrgJobs: number
}

export type AuditTurnkeyProvisioningGapsResult = {
  parentProvisioningPolicy: Awaited<ReturnType<typeof ensureParentSubOrgProvisioningPolicy>>
  awaitingSubOrgJobCount: number
  approvedWithoutSubOrg: TurnkeyProvisioningGapRow[]
  summary: {
    businessApprovedWithoutSubOrg: number
    individualApprovedWithoutSubOrg: number
  }
}

function isApprovedStatus(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === "approved"
}

async function countAwaitingSubOrgJobs(
  admin: SupabaseClient,
  walletOwnerId: string,
): Promise<number> {
  const { count } = await admin
    .from("wallet_provisioning_jobs")
    .select("id", { count: "exact", head: true })
    .eq("wallet_owner_id", walletOwnerId)
    .eq("state", "awaiting_sub_org")
  return count ?? 0
}

/**
 * Find verified customers missing Turnkey sub-orgs (Grizzly-class provisioning gaps).
 * Safe to run from ops scripts or admin dashboards.
 */
export async function auditTurnkeyProvisioningGaps(
  admin: SupabaseClient,
): Promise<AuditTurnkeyProvisioningGapsResult> {
  const parentProvisioningPolicy = await ensureParentSubOrgProvisioningPolicy()

  const { count: awaitingSubOrgJobCount } = await admin
    .from("wallet_provisioning_jobs")
    .select("id", { count: "exact", head: true })
    .eq("state", "awaiting_sub_org")

  const approvedWithoutSubOrg: TurnkeyProvisioningGapRow[] = []

  const { data: businessRows } = await admin
    .from("businesses")
    .select("id,name,verification_status,verification_provider,grid_customer_id")
    .eq("verification_status", "approved")
    .limit(500)

  for (const biz of businessRows ?? []) {
    const businessId = String(biz.id ?? "").trim()
    if (!businessId) continue
    const provider = String(biz.verification_provider ?? "").trim().toLowerCase()
    if (provider !== "grid" && !String(biz.grid_customer_id ?? "").trim()) continue

    const { data: owner } = await admin
      .from("wallet_owners")
      .select("id,turnkey_sub_organization_id")
      .eq("owner_type", "business")
      .eq("owner_ref", businessId)
      .maybeSingle()

    const subOrg = String(owner?.turnkey_sub_organization_id ?? "").trim()
    if (subOrg) continue

    const awaitingSubOrgJobs = owner?.id
      ? await countAwaitingSubOrgJobs(admin, String(owner.id))
      : 0

    approvedWithoutSubOrg.push({
      ownerType: "business",
      ownerRef: businessId,
      label: String(biz.name ?? "").trim() || null,
      partnerCustomerId: String(biz.grid_customer_id ?? "").trim() || null,
      verificationStatus: String(biz.verification_status ?? "").trim() || null,
      awaitingSubOrgJobs,
    })
  }

  const { data: userRows } = await admin
    .from("users")
    .select("id,email,full_name,verification_status,noah_kyc_status")
    .limit(2000)

  for (const user of userRows ?? []) {
    const userId = String(user.id ?? "").trim()
    if (!userId) continue
    const verified =
      isApprovedStatus(user.verification_status) || isApprovedStatus(user.noah_kyc_status)
    if (!verified) continue

    const { data: owner } = await admin
      .from("wallet_owners")
      .select("id,turnkey_sub_organization_id,noah_customer_id")
      .eq("owner_type", "individual")
      .eq("owner_ref", userId)
      .maybeSingle()

    const subOrg = String(owner?.turnkey_sub_organization_id ?? "").trim()
    if (subOrg) continue

    const awaitingSubOrgJobs = owner?.id
      ? await countAwaitingSubOrgJobs(admin, String(owner.id))
      : 0

    approvedWithoutSubOrg.push({
      ownerType: "individual",
      ownerRef: userId,
      label: String(user.full_name ?? user.email ?? "").trim() || null,
      partnerCustomerId: String(owner?.noah_customer_id ?? "").trim() || null,
      verificationStatus: isApprovedStatus(user.verification_status)
        ? String(user.verification_status)
        : String(user.noah_kyc_status ?? ""),
      awaitingSubOrgJobs,
    })
  }

  return {
    parentProvisioningPolicy,
    awaitingSubOrgJobCount: awaitingSubOrgJobCount ?? 0,
    approvedWithoutSubOrg,
    summary: {
      businessApprovedWithoutSubOrg: approvedWithoutSubOrg.filter((r) => r.ownerType === "business")
        .length,
      individualApprovedWithoutSubOrg: approvedWithoutSubOrg.filter(
        (r) => r.ownerType === "individual",
      ).length,
    },
  }
}

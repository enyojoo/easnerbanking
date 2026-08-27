import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { hasActiveGridVirtualAccountForBusinessInDb } from "@/lib/noah/virtual-accounts-db"
import { refreshGridBusinessReceiveRails } from "@/lib/grid/provision-after-approval"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"

export type GridReceiveRailsReconcileRow = {
  businessId: string
  name: string | null
  gridCustomerId: string
  reason: "missing_usd_va" | "missing_turnkey_sub_org"
  result: {
    gridVirtualAccountsPersisted: number
    gridVirtualAccountsPending: boolean
    gridExternalAccountId: string | null
  } | null
  error: string | null
}

/**
 * Durable retry for Grid KYB businesses that finished Turnkey but never got
 * `virtual_accounts` rows because Grid INTERNAL_FIAT was still PENDING at first refresh.
 *
 * Also retries when wallet_owners.turnkey_sub_organization_id is missing (sub-org create raced).
 */
export async function reconcilePendingGridBusinessReceiveRails(
  admin: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<{ scanned: number; refreshed: number; pending: number; rows: GridReceiveRailsReconcileRow[] }> {
  const limit = Math.max(1, Math.min(50, opts.limit ?? 15))

  const { data: businesses, error } = await admin
    .from("businesses")
    .select("id,name,grid_customer_id,kyb_verified_at")
    .eq("verification_status", "approved")
    .eq("verification_provider", "grid")
    .not("grid_customer_id", "is", null)
    .order("kyb_verified_at", { ascending: false, nullsFirst: false })
    .limit(100)

  if (error) {
    console.warn("[grid] reconcile receive rails list failed:", error.message)
    return { scanned: 0, refreshed: 0, pending: 0, rows: [] }
  }

  const candidates: Array<{
    businessId: string
    name: string | null
    gridCustomerId: string
    reason: GridReceiveRailsReconcileRow["reason"]
  }> = []

  for (const biz of businesses ?? []) {
    const businessId = String(biz.id ?? "").trim()
    const gridCustomerId = String(biz.grid_customer_id ?? "").trim()
    if (!businessId || !gridCustomerId) continue

    const hasUsdVa = await hasActiveGridVirtualAccountForBusinessInDb(admin, {
      currency: "usd",
      businessId,
    })
    if (!hasUsdVa) {
      candidates.push({
        businessId,
        name: biz.name != null ? String(biz.name) : null,
        gridCustomerId,
        reason: "missing_usd_va",
      })
      continue
    }

    const ownerId = await getWalletOwnerId(admin, "business", businessId)
    if (!ownerId) {
      candidates.push({
        businessId,
        name: biz.name != null ? String(biz.name) : null,
        gridCustomerId,
        reason: "missing_turnkey_sub_org",
      })
      continue
    }
    const { data: owner } = await admin
      .from("wallet_owners")
      .select("turnkey_sub_organization_id")
      .eq("id", ownerId)
      .maybeSingle()
    if (!String(owner?.turnkey_sub_organization_id ?? "").trim()) {
      candidates.push({
        businessId,
        name: biz.name != null ? String(biz.name) : null,
        gridCustomerId,
        reason: "missing_turnkey_sub_org",
      })
    }
  }

  const toRefresh = candidates.slice(0, limit)
  const rows: GridReceiveRailsReconcileRow[] = []
  let refreshed = 0
  let pending = 0

  for (const c of toRefresh) {
    const userId = await resolveBusinessOrgOwnerUserId(admin, c.businessId)
    if (!userId) {
      rows.push({
        ...c,
        result: null,
        error: "org_owner_missing",
      })
      continue
    }

    try {
      const result = await refreshGridBusinessReceiveRails({
        admin,
        businessId: c.businessId,
        userId,
        gridCustomerId: c.gridCustomerId,
      })
      if (result.gridVirtualAccountsPersisted > 0) {
        refreshed += 1
      } else if (result.gridVirtualAccountsPending || !result.gridExternalAccountId) {
        pending += 1
      } else {
        // External account ok but VA still missing (unusual) – keep retrying.
        pending += 1
      }
      rows.push({ ...c, result, error: null })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.warn("[grid] reconcile receive rails failed", {
        businessId: c.businessId,
        error: message,
      })
      rows.push({ ...c, result: null, error: message })
    }
  }

  return {
    scanned: candidates.length,
    refreshed,
    pending,
    rows,
  }
}

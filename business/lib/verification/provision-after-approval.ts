import type { SupabaseClient } from "@supabase/supabase-js"
import { readVerificationRow, type VerificationProvider } from "@/lib/compliance"
import { provisionNoahAfterVerificationApproved } from "@/lib/noah/provision-after-approval"
import { provisionGridAfterBusinessKybApproved } from "@/lib/grid/provision-after-approval"
import { provisionBridgeVirtualAccounts } from "@/lib/bridge/provision-after-approval"

function looksLikeGridCustomerId(id: string | null | undefined): boolean {
  const raw = String(id ?? "").trim()
  if (!raw) return false
  // Grid: "Customer:0195…"; Noah business ids are typically "ebiz_…" / compact UUIDs without this prefix.
  return /^Customer:/i.test(raw)
}

/**
 * Post-verification provisioning hub: Turnkey + provider rails after canonical approval.
 * Business Grid KYB must never fall through to Noah VA / bank-onramp workflows.
 */
export async function provisionAfterVerificationApproved(opts: {
  admin: SupabaseClient
  scope: "business" | "individual"
  subjectUserId: string
  subjectBusinessId: string | null
  partnerCustomerId?: string | null
  /** When callers already know the provider (e.g. Grid sync), pass it to avoid mis-routing. */
  provider?: VerificationProvider | null
}): Promise<Record<string, unknown>> {
  const row =
    opts.scope === "business" && opts.subjectBusinessId
      ? await readVerificationRow(opts.admin, {
          kind: "business",
          businessId: opts.subjectBusinessId,
          userId: opts.subjectUserId,
        })
      : await readVerificationRow(opts.admin, {
          kind: "individual",
          userId: opts.subjectUserId,
        })

  const fromRow = String(row?.verification_provider ?? "").toLowerCase()
  const fromOpts = String(opts.provider ?? "").toLowerCase()
  const bridgeCustomerId = String(row?.bridge_customer_id ?? opts.partnerCustomerId ?? "").trim()
  const bridgeApproved = String(row?.bridge_kyc_status ?? "").toLowerCase() === "approved"

  const gridCustomerId =
    String(row?.grid_customer_id ?? "").trim() ||
    (looksLikeGridCustomerId(opts.partnerCustomerId)
      ? String(opts.partnerCustomerId).trim()
      : "")

  const useGridBusiness =
    opts.scope === "business" &&
    Boolean(opts.subjectBusinessId) &&
    fromOpts !== "bridge" &&
    (fromOpts === "grid" ||
      fromRow === "grid" ||
      Boolean(gridCustomerId) ||
      looksLikeGridCustomerId(opts.partnerCustomerId))

  if (useGridBusiness && opts.subjectBusinessId) {
    return provisionGridAfterBusinessKybApproved({
      admin: opts.admin,
      businessId: opts.subjectBusinessId,
      subjectUserId: opts.subjectUserId,
      gridCustomerId: gridCustomerId || opts.partnerCustomerId || null,
    })
  }

  const useBridge =
    fromOpts === "bridge" ||
    fromRow === "bridge" ||
    (opts.scope === "business" && Boolean(bridgeCustomerId) && bridgeApproved)

  if (useBridge) {
    if (!bridgeCustomerId) return { skipped: true, reason: "missing_bridge_customer_id" }
    const vas = await provisionBridgeVirtualAccounts({
      admin: opts.admin,
      userId: opts.subjectUserId,
      businessId: opts.scope === "business" ? opts.subjectBusinessId : null,
      customerId: bridgeCustomerId,
    })
    return { provider: "bridge", ...vas }
  }

  const noahCustomerId = String(opts.partnerCustomerId ?? "").trim()
  if (looksLikeGridCustomerId(noahCustomerId)) {
    console.warn(
      "[provisionAfterVerificationApproved] refusing Noah provision with Grid customer id",
      { noahCustomerId, scope: opts.scope, businessId: opts.subjectBusinessId },
    )
    return { skipped: true, reason: "grid_customer_id_not_valid_for_noah" }
  }

  return provisionNoahAfterVerificationApproved({
    admin: opts.admin,
    scope: opts.scope === "business" ? "business" : "individual",
    noahCustomerId,
    subjectUserId: opts.subjectUserId,
    subjectBusinessId: opts.subjectBusinessId,
  })
}

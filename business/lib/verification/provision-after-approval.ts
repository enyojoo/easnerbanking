import type { SupabaseClient } from "@supabase/supabase-js"
import { readVerificationRow, type VerificationProvider } from "@/lib/compliance"
import { provisionNoahAfterVerificationApproved } from "@/lib/noah/provision-after-approval"
import { provisionGridAfterBusinessKybApproved } from "@/lib/grid/provision-after-approval"

/**
 * Post-verification provisioning hub: Turnkey + provider rails after canonical approval.
 */
export async function provisionAfterVerificationApproved(opts: {
  admin: SupabaseClient
  scope: "business" | "individual"
  subjectUserId: string
  subjectBusinessId: string | null
  partnerCustomerId?: string | null
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

  const provider = String(row?.verification_provider ?? "").toLowerCase() as VerificationProvider

  if (opts.scope === "business" && provider === "grid" && opts.subjectBusinessId) {
    return provisionGridAfterBusinessKybApproved({
      admin: opts.admin,
      businessId: opts.subjectBusinessId,
      subjectUserId: opts.subjectUserId,
      gridCustomerId: row?.grid_customer_id ?? opts.partnerCustomerId ?? null,
    })
  }

  return provisionNoahAfterVerificationApproved({
    admin: opts.admin,
    scope: opts.scope === "business" ? "business" : "individual",
    noahCustomerId: String(opts.partnerCustomerId ?? "").trim(),
    subjectUserId: opts.subjectUserId,
    subjectBusinessId: opts.subjectBusinessId,
  })
}

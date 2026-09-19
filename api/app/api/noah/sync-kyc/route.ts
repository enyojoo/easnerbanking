import { NextResponse } from "next/server"
import { fetchNoahCustomerForScope } from "@/lib/noah/fetch-customer"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { provisionAfterVerificationApproved } from "@/lib/verification/provision-after-approval"
import { businessUsesGridVerification } from "@/lib/compliance/business-tier1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const ctx = await resolveNoahContextAsync(user.id, request)
  if (!ctx.ok) return ctx.response

  try {
    const subjectId = ctx.scope === "business" ? (ctx.businessId ?? ctx.noahCustomerId) : user.id
    const { customer, resolvedCustomerId } = await fetchNoahCustomerForScope(
      ctx.scope,
      subjectId,
      ctx.noahCustomerId,
    )
    await syncNoahCustomerToSupabase(
      ctx.scope === "business" && ctx.businessId
        ? { kind: "business", businessId: ctx.businessId }
        : { kind: "individual", userId: user.id },
      customer,
      resolvedCustomerId,
    )
    const kyc = mapNoahVerificationToKycStatus(customer)
    let provisioned: Record<string, unknown> | undefined
    if (kyc === "approved") {
      const admin = createSupabaseAdmin()
      let gridCustomerId: string | null = null
      if (ctx.scope === "business" && ctx.businessId) {
        const { data: biz } = await admin
          .from("businesses")
          .select("verification_provider,grid_customer_id")
          .eq("id", ctx.businessId)
          .maybeSingle()
        if (businessUsesGridVerification(biz as { verification_provider?: string | null } | null)) {
          gridCustomerId = String(biz?.grid_customer_id ?? "").trim() || null
        }
      }
      provisioned = await provisionAfterVerificationApproved({
        admin,
        scope: ctx.scope,
        subjectUserId: user.id,
        subjectBusinessId: ctx.businessId,
        partnerCustomerId: gridCustomerId ?? resolvedCustomerId,
        provider: gridCustomerId ? "grid" : undefined,
      })
    }
    return NextResponse.json({ success: true, noahScope: ctx.scope, provisioned })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

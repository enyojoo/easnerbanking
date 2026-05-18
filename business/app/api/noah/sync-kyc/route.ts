import { NextResponse } from "next/server"
import { fetchNoahCustomerWithIndividualFallback } from "@/lib/noah/fetch-customer"
import { noahFetch } from "@/lib/noah/http"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { provisionNoahAfterVerificationApproved } from "@/lib/noah/provision-after-approval"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const ctx = await resolveNoahContextAsync(user.id, request)
  if (!ctx.ok) return ctx.response

  try {
    const { customer, resolvedCustomerId } =
      ctx.scope === "individual"
        ? await fetchNoahCustomerWithIndividualFallback(user.id, ctx.noahCustomerId)
        : {
            customer: await noahFetch<Record<string, unknown>>({
              method: "GET",
              path: `/customers/${encodeURIComponent(ctx.noahCustomerId)}`,
            }),
            resolvedCustomerId: ctx.noahCustomerId,
          }
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
      provisioned = await provisionNoahAfterVerificationApproved({
        admin,
        scope: ctx.scope,
        noahCustomerId: resolvedCustomerId,
        subjectUserId: user.id,
        subjectBusinessId: ctx.businessId,
      })
    }
    return NextResponse.json({ success: true, noahScope: ctx.scope, provisioned })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

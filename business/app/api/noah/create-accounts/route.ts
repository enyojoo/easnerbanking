import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { fetchNoahCustomerForScope } from "@/lib/noah/fetch-customer"
import { noahFetch } from "@/lib/noah/http"
import { buildHostedOnboardingBody } from "@/lib/noah/hosted-onboarding"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { provisionAfterVerificationApproved } from "@/lib/verification/provision-after-approval"
import { businessUsesGridVerification } from "@/lib/compliance/business-tier1"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { type?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }

  const acc = await resolveNoahAccountContext(request, user.id, body.type)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(
      acc.ctx.subjectUserId,
      acc.ctx.scope,
      acc.ctx.subjectBusinessId,
    )
  if (guard) return guard

  const { noahCustomerId, subjectUserId, scope, customerType } = acc.ctx

  const errors: string[] = []

  try {
    // Noah returns an empty body (→ null) when there's no resumable hosted session (e.g. submitted/
    // under review). Coalesce so we never deref null ("Cannot read properties of null").
    const session =
      (await noahFetch<Record<string, unknown> | null>({
        method: "POST",
        path: `/onboarding/${encodeURIComponent(noahCustomerId)}`,
        json: buildHostedOnboardingBody({
          scope,
          customerType,
          metadata: {
            easner_user_id: subjectUserId,
            ...(acc.ctx.subjectBusinessId ? { easner_business_id: acc.ctx.subjectBusinessId } : {}),
            easner_product: scope === "business" ? "easner_business" : "easner_mobile",
          },
        }),
      })) ?? {}

    const hostedUrl = session.HostedURL as string | undefined
    if (hostedUrl) {
      /* hosted session returned – customer may still be completing setup */
    }

    const subjectId =
      scope === "business" ? (acc.ctx.subjectBusinessId ?? noahCustomerId) : subjectUserId
    const { customer, resolvedCustomerId } = await fetchNoahCustomerForScope(
      scope,
      subjectId,
      noahCustomerId,
    )
    await syncNoahCustomerToSupabase(
      scope === "business" && acc.ctx.subjectBusinessId
        ? { kind: "business", businessId: acc.ctx.subjectBusinessId }
        : { kind: "individual", userId: subjectUserId },
      customer,
      resolvedCustomerId,
    )

    const admin = createSupabaseAdmin()
    let gridCustomerId: string | null = null
    if (scope === "business" && acc.ctx.subjectBusinessId) {
      const { data: biz } = await admin
        .from("businesses")
        .select("verification_provider,grid_customer_id")
        .eq("id", acc.ctx.subjectBusinessId)
        .maybeSingle()
      if (businessUsesGridVerification(biz as { verification_provider?: string | null } | null)) {
        gridCustomerId = String(biz?.grid_customer_id ?? "").trim() || null
      }
    }
    const provisioned = await provisionAfterVerificationApproved({
      admin,
      scope,
      subjectUserId,
      subjectBusinessId: acc.ctx.subjectBusinessId,
      partnerCustomerId: gridCustomerId ?? resolvedCustomerId,
      provider: gridCustomerId ? "grid" : undefined,
    })

    return NextResponse.json({
      success: true,
      usdAccountCreated: provisioned.usdAccountCreated,
      eurAccountCreated: provisioned.eurAccountCreated,
      gbpAccountCreated: provisioned.gbpAccountCreated,
      usdAccountId: provisioned.usdAccountId,
      eurAccountId: provisioned.eurAccountId,
      gbpAccountId: provisioned.gbpAccountId,
      usdcAddress: provisioned.usdcAddress,
      eurcAddress: provisioned.eurcAddress,
      hostedURL: hostedUrl,
      kycStatus: mapNoahVerificationToKycStatus(customer),
      errors,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(msg)
    return NextResponse.json(
      {
        usdAccountCreated: false,
        eurAccountCreated: false,
        gbpAccountCreated: false,
        errors,
        error: msg,
      },
      { status: 400 },
    )
  }
}

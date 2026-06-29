import { NextResponse } from "next/server"
import { fetchNoahCustomerForScope } from "@/lib/noah/fetch-customer"
import { noahFetch } from "@/lib/noah/http"
import { buildHostedOnboardingBody } from "@/lib/noah/hosted-onboarding"
import { mapNoahCustomerToMobileSummary, mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"

export async function GET(request: Request) {
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
    return NextResponse.json(mapNoahCustomerToMobileSummary(customer, resolvedCustomerId))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("404") || /not found/i.test(msg)) {
      return NextResponse.json({ hasCustomer: false })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

/**
 * Create / refresh [Noah Hosted Onboarding](https://docs.noah.com/recipes/onboarding/hosted-onboarding/)
 * — mobile consumer (Individual) by default; Easner Business (KYB) when `type: "business"` or
 * header `X-Easner-Noah-Scope: business`.
 */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { needsUSD?: boolean; needsEUR?: boolean; type?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }

  const ctx = await resolveNoahContextAsync(user.id, request, body.type)
  if (!ctx.ok) return ctx.response

  try {
    // Noah returns an empty body (→ null) when there's no resumable hosted session (e.g. submitted/
    // under review). Coalesce so we never deref null ("Cannot read properties of null").
    const session =
      (await noahFetch<Record<string, unknown> | null>({
        method: "POST",
        path: `/onboarding/${encodeURIComponent(ctx.noahCustomerId)}`,
        json: buildHostedOnboardingBody({
          scope: ctx.scope,
          customerType: ctx.customerType,
          metadata: {
            easner_user_id: user.id,
            ...(ctx.businessId ? { easner_business_id: ctx.businessId } : {}),
            easner_product: ctx.scope === "business" ? "easner_business" : "easner_mobile",
          },
        }),
      })) ?? {}

    const hostedUrl = session.HostedURL as string | undefined
    if (hostedUrl) {
      return NextResponse.json({
        customerId: ctx.noahCustomerId,
        kycStatus: "not_started",
        walletId: undefined,
        usdVirtualAccountId: undefined,
        eurVirtualAccountId: undefined,
        rejectionReasons: undefined,
        hostedURL: hostedUrl,
        onboardingStatus: session.OnboardingStatus,
        noahScope: ctx.scope,
      })
    }

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
    return NextResponse.json({
      ...mapNoahCustomerToMobileSummary(customer, resolvedCustomerId),
      noahScope: ctx.scope,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

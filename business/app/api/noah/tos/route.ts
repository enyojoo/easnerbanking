import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { buildHostedOnboardingBody } from "@/lib/noah/hosted-onboarding"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../_helpers"

/** Hosted onboarding includes Terms & Conditions — expose as legacy `tosLink` for mobile. */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { email?: string; type?: "individual" | "business" } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }

  const ctx = resolveNoahContext(user.id, request, body.type)

  try {
    const session = await noahFetch<Record<string, unknown>>({
      method: "POST",
      path: `/onboarding/${encodeURIComponent(ctx.noahCustomerId)}`,
      json: buildHostedOnboardingBody({
        scope: ctx.scope,
        customerType: ctx.customerType,
        metadata: {
          easner_user_id: user.id,
          email: body.email || user.email || "",
          easner_product: ctx.scope === "business" ? "easner_business" : "easner_mobile",
        },
      }),
    })

    const url = session.HostedURL as string
    return NextResponse.json({
      tosLink: url,
      tosLinkId: ctx.noahCustomerId,
      onboardingStatus: session.OnboardingStatus,
      noahScope: ctx.scope,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const { searchParams } = new URL(request.url)
  const _tosLinkId = searchParams.get("tosLinkId")

  const ctx = resolveNoahContext(user.id, request)

  try {
    const customer = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/customers/${encodeURIComponent(ctx.noahCustomerId)}`,
    })
    await syncNoahCustomerToSupabase(user.id, customer, ctx.noahCustomerId, ctx.scope)
    const kyc = mapNoahVerificationToKycStatus(customer)
    const signed = kyc === "approved"
    return NextResponse.json({
      signed,
      signedAgreementId: signed ? ctx.noahCustomerId : undefined,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

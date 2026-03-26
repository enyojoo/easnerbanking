import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { buildHostedOnboardingBody } from "@/lib/noah/hosted-onboarding"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../_helpers"

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { full_name?: string; email?: string; type?: string } = {}
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
          full_name: body.full_name || "",
          email: body.email || user.email || "",
          easner_product: ctx.scope === "business" ? "easner_business" : "easner_mobile",
        },
      }),
    })

    const url = session.HostedURL as string
    return NextResponse.json({
      kyc_link: url,
      tos_link: url,
      kyc_status: "not_started",
      tos_status: "pending",
      customer_id: ctx.noahCustomerId,
      kyc_link_id: ctx.noahCustomerId,
      noahScope: ctx.scope,
      hostedCustomerType: ctx.customerType,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

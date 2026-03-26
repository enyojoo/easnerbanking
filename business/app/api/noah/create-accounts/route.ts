import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { buildHostedOnboardingBody } from "@/lib/noah/hosted-onboarding"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../_helpers"

type PmResp = { Items?: Array<Record<string, unknown>>; PageToken?: string }

function hasPayinBank(pm: Record<string, unknown>, country: string): boolean {
  const caps = pm.Capabilities as Record<string, unknown> | undefined
  if (caps && caps.PayinTo === false) return false
  return String(pm.Country ?? "").toUpperCase() === country
}

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  /** Mobile consumer flow — Individual hosted onboarding. */
  const ctx = resolveNoahContext(user.id, request)

  const errors: string[] = []

  try {
    const session = await noahFetch<Record<string, unknown>>({
      method: "POST",
      path: `/onboarding/${encodeURIComponent(ctx.noahCustomerId)}`,
      json: buildHostedOnboardingBody({
        scope: ctx.scope,
        customerType: ctx.customerType,
        metadata: {
          easner_user_id: user.id,
          easner_product: "easner_mobile",
        },
      }),
    })

    const hostedUrl = session.HostedURL as string | undefined
    if (hostedUrl) {
      /* hosted session returned — customer may still be completing setup */
    }

    const customer = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/customers/${encodeURIComponent(ctx.noahCustomerId)}`,
    })
    await syncNoahCustomerToSupabase(user.id, customer, ctx.noahCustomerId, ctx.scope)

    const allPm: Array<Record<string, unknown>> = []
    let token: string | undefined
    for (let i = 0; i < 5; i++) {
      const data = await noahFetch<PmResp>({
        method: "GET",
        path: "/payment-methods",
        query: { CustomerID: ctx.noahCustomerId, PageSize: 50, ...(token ? { PageToken: token } : {}) },
      })
      const items = data.Items ?? []
      allPm.push(...items)
      token = data.PageToken
      if (!token || items.length === 0) break
    }

    const usdPm = allPm.find((pm) => hasPayinBank(pm, "US"))
    const eurPm = allPm.find((pm) => {
      const caps = pm.Capabilities as Record<string, unknown> | undefined
      if (caps && caps.PayinTo === false) return false
      const c = String(pm.Country ?? "").toUpperCase()
      return c !== "US" && c.length === 2
    })

    return NextResponse.json({
      walletCreated: false,
      usdAccountCreated: !!usdPm,
      eurAccountCreated: !!eurPm,
      usdAccountId: usdPm ? String(usdPm.ID ?? "") : undefined,
      eurAccountId: eurPm ? String(eurPm.ID ?? "") : undefined,
      hostedURL: hostedUrl,
      kycStatus: mapNoahVerificationToKycStatus(customer),
      errors,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(msg)
    return NextResponse.json(
      {
        walletCreated: false,
        usdAccountCreated: false,
        eurAccountCreated: false,
        errors,
        error: msg,
      },
      { status: 400 }
    )
  }
}

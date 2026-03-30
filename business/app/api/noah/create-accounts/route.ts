import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { buildHostedOnboardingBody } from "@/lib/noah/hosted-onboarding"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { fetchAllPaymentMethodsForCustomer } from "@/lib/noah/list-payment-methods"
import { hasPayinBank, matchesCurrency } from "@/lib/noah/payment-method-map"
import { persistVirtualAccountFromPaymentMethod } from "@/lib/noah/persist-account-data"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"

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

  const guard = await requireNoahVerificationApproved(acc.ctx.subjectUserId, acc.ctx.scope)
  if (guard) return guard

  const { noahCustomerId, subjectUserId, scope, customerType } = acc.ctx

  const errors: string[] = []

  try {
    const session = await noahFetch<Record<string, unknown>>({
      method: "POST",
      path: `/onboarding/${encodeURIComponent(noahCustomerId)}`,
      json: buildHostedOnboardingBody({
        scope,
        customerType,
        metadata: {
          easner_user_id: subjectUserId,
          easner_product: scope === "business" ? "easner_business" : "easner_mobile",
        },
      }),
    })

    const hostedUrl = session.HostedURL as string | undefined
    if (hostedUrl) {
      /* hosted session returned — customer may still be completing setup */
    }

    const customer = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/customers/${encodeURIComponent(noahCustomerId)}`,
    })
    await syncNoahCustomerToSupabase(subjectUserId, customer, noahCustomerId, scope)

    const allPm = await fetchAllPaymentMethodsForCustomer(noahCustomerId)

    const usdPm = allPm.find((pm) => hasPayinBank(pm, "US"))
    const eurPm = allPm.find((pm) => {
      const caps = pm.Capabilities as Record<string, unknown> | undefined
      if (caps && caps.PayinTo === false) return false
      return matchesCurrency(pm, "eur")
    })
    const gbpPm = allPm.find((pm) => hasPayinBank(pm, "GB"))

    if (usdPm) await persistVirtualAccountFromPaymentMethod(subjectUserId, "usd", usdPm)
    if (eurPm) await persistVirtualAccountFromPaymentMethod(subjectUserId, "eur", eurPm)
    if (gbpPm) await persistVirtualAccountFromPaymentMethod(subjectUserId, "gbp", gbpPm)

    return NextResponse.json({
      walletCreated: false,
      usdAccountCreated: !!usdPm,
      eurAccountCreated: !!eurPm,
      gbpAccountCreated: !!gbpPm,
      usdAccountId: usdPm ? String(usdPm.ID ?? "") : undefined,
      eurAccountId: eurPm ? String(eurPm.ID ?? "") : undefined,
      gbpAccountId: gbpPm ? String(gbpPm.ID ?? "") : undefined,
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
        gbpAccountCreated: false,
        errors,
        error: msg,
      },
      { status: 400 },
    )
  }
}

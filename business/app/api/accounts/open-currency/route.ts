import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { TIER2_COMPLETE_PLACEHOLDER } from "@/lib/compliance-placeholders"
import { appendEnabledExtraCurrency } from "@/lib/accounts/enabled-extras"
import { fetchAllPaymentMethodsForCustomer } from "@/lib/noah/list-payment-methods"
import { matchesCurrency } from "@/lib/noah/payment-method-map"
import { persistVirtualAccountFromPaymentMethod } from "@/lib/noah/persist-account-data"
import { requireNoahEnv } from "@/app/api/noah/_helpers"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { ensureCurrencyUsable } from "@/lib/accounts/currency-controls"

/**
 * Provider-agnostic entrypoint: after KYC/KYB tiers, open an extra currency (Noah GBP today; Tier 2 NGN stub).
 */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis

  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { currency?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const raw = body.currency?.trim().toUpperCase()
  if (!raw) {
    return NextResponse.json({ error: "currency is required" }, { status: 400 })
  }

  const currencyGuard = await ensureCurrencyUsable(raw)
  if (!currencyGuard.ok) {
    return NextResponse.json({ error: currencyGuard.reason, code: "CURRENCY_DISABLED" }, { status: 403 })
  }

  if (raw === "USD" || raw === "EUR") {
    return NextResponse.json({ error: "USD and EUR are default accounts – use accounts page directly." }, { status: 400 })
  }

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(
      acc.ctx.subjectUserId,
      acc.ctx.scope,
      acc.ctx.subjectBusinessId,
    )
  if (guard) return guard

  const { noahCustomerId, subjectUserId, scope } = acc.ctx

  if (raw === "NGN") {
    if (!TIER2_COMPLETE_PLACEHOLDER) {
      return NextResponse.json(
        { error: "African banking verification is required for NGN.", code: "TIER2_REQUIRED" },
        { status: 403 },
      )
    }
    return NextResponse.json(
      { error: "NGN provider integration is not connected yet.", code: "PROVIDER_NOT_READY" },
      { status: 501 },
    )
  }

  if (raw === "GBP") {
    try {
      const allPm = await fetchAllPaymentMethodsForCustomer(noahCustomerId)
      const gbpPm = allPm.find((pm) => matchesCurrency(pm, "gbp"))
      if (!gbpPm) {
        return NextResponse.json(
          {
            error: "GBP is not available for your account from the provider yet.",
            code: "NO_PAYMENT_METHOD",
          },
          { status: 400 },
        )
      }
      await persistVirtualAccountFromPaymentMethod(subjectUserId, "gbp", gbpPm, acc.ctx.subjectBusinessId)
      await appendEnabledExtraCurrency(subjectUserId, scope, "GBP")
      return NextResponse.json({ success: true, currency: "GBP", provider: "noah" })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  return NextResponse.json({ error: `Currency ${raw} is not available to open yet.` }, { status: 400 })
}

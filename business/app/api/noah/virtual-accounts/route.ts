import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { fetchAllPaymentMethodsForCustomer } from "@/lib/noah/list-payment-methods"
import {
  mapPaymentMethodToVirtualAccountDisplay,
  matchesCurrency,
} from "@/lib/noah/payment-method-map"
import { persistVirtualAccountFromPaymentMethod } from "@/lib/noah/persist-account-data"
import { provisionNoahArtifactsForCustomer } from "@/lib/noah/provisioning"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { ensureCurrencyUsable } from "@/lib/accounts/currency-controls"

export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(
      acc.ctx.subjectUserId,
      acc.ctx.scope,
      acc.ctx.subjectBusinessId,
    )
  if (guard) return guard

  const { noahCustomerId, subjectUserId, subjectBusinessId } = acc.ctx
  await provisionNoahArtifactsForCustomer({
    subjectUserId,
    subjectBusinessId,
    noahCustomerId,
    scope: acc.ctx.scope,
  })

  const url = new URL(request.url)
  const currency = (url.searchParams.get("currency") || "usd").toLowerCase() as "usd" | "eur" | "gbp"
  if (currency !== "usd" && currency !== "eur" && currency !== "gbp") {
    return NextResponse.json({ error: "currency must be usd, eur, or gbp" }, { status: 400 })
  }
  const guardCurrency = await ensureCurrencyUsable(currency.toUpperCase())
  if (!guardCurrency.ok) {
    return NextResponse.json({ error: guardCurrency.reason, code: "CURRENCY_DISABLED" }, { status: 403 })
  }

  try {
    const all = await fetchAllPaymentMethodsForCustomer(noahCustomerId)

    const candidates = all.filter((pm) => {
      const caps = pm.Capabilities as Record<string, unknown> | undefined
      if (caps && caps.PayinTo === false) return false
      return matchesCurrency(pm, currency)
    })

    const pm = candidates[0]
    if (!pm) {
      return NextResponse.json({
        hasAccount: false,
        currency,
      })
    }

    const display = mapPaymentMethodToVirtualAccountDisplay(pm, currency)
    await persistVirtualAccountFromPaymentMethod(subjectUserId, currency, pm, subjectBusinessId)

    return NextResponse.json({
      hasAccount: true,
      currency,
      accountNumber: display.accountNumber,
      routingNumber: display.routingNumber,
      sortCode: display.sortCode,
      iban: display.iban,
      bic: display.bic,
      bankName: display.bankName,
      bankAddress: display.bankAddress,
      accountHolderName: display.accountHolderName,
      status: display.status,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

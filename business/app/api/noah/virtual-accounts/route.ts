import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { fetchAllPaymentMethodsForCustomer } from "@/lib/noah/list-payment-methods"
import {
  mapPaymentMethodToVirtualAccountDisplay,
  matchesCurrency,
} from "@/lib/noah/payment-method-map"
import { persistVirtualAccountFromPaymentMethod } from "@/lib/noah/persist-account-data"
import { provisionNoahArtifactsForCustomer } from "@/lib/noah/provisioning"
import { isNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
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

  const { noahCustomerId, subjectUserId, subjectBusinessId } = acc.ctx

  const url = new URL(request.url)
  const currency = (url.searchParams.get("currency") || "usd").toLowerCase() as "usd" | "eur" | "gbp"
  if (currency !== "usd" && currency !== "eur" && currency !== "gbp") {
    return NextResponse.json({ error: "currency must be usd, eur, or gbp" }, { status: 400 })
  }
  const guardCurrency = await ensureCurrencyUsable(currency.toUpperCase())
  if (!guardCurrency.ok) {
    return NextResponse.json({ error: guardCurrency.reason, code: "CURRENCY_DISABLED" }, { status: 403 })
  }

  const admin = createSupabaseAdmin()
  const cached = await getVirtualAccountDisplayFromDb(admin, {
    currency,
    userId: subjectUserId,
    businessId: subjectBusinessId,
  })
  if (cached?.hasAccount) {
    return NextResponse.json({
      hasAccount: true,
      currency,
      accountNumber: cached.accountNumber,
      routingNumber: cached.routingNumber,
      sortCode: cached.sortCode,
      iban: cached.iban,
      bic: cached.bic,
      bankName: cached.bankName,
      bankAddress: cached.bankAddress,
      accountHolderName: cached.accountHolderName,
      status: cached.status,
      source: "db",
    })
  }

  const approved = await isNoahVerificationApproved(admin, {
    subjectUserId,
    scope: acc.ctx.scope,
    subjectBusinessId,
  })
  if (!approved) {
    return NextResponse.json({ hasAccount: false, currency })
  }

  await provisionNoahArtifactsForCustomer({
    subjectUserId,
    subjectBusinessId,
    noahCustomerId,
    scope: acc.ctx.scope,
    admin,
  })

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
    await persistVirtualAccountFromPaymentMethod(
      subjectUserId,
      currency,
      pm,
      subjectBusinessId,
      noahCustomerId,
    )

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
      source: "noah",
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

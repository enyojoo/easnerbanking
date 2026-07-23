import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { fetchAllPaymentMethodsForCustomer } from "@/lib/noah/list-payment-methods"
import {
  mapPaymentMethodToVirtualAccountDisplay,
  selectPreferredEurPayinPaymentMethod,
  selectPreferredUsdPayinPaymentMethod,
} from "@/lib/noah/payment-method-map"
import { persistVirtualAccountFromPaymentMethod } from "@/lib/noah/persist-account-data"
import { provisionNoahArtifactsForCustomer } from "@/lib/noah/provisioning"
import { isNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
import { resolveNoahAccountContext, type NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { ensureCurrencyUsable } from "@/lib/accounts/currency-controls"

type VaCurrency = "usd" | "eur" | "gbp"

type VaAccountJson = {
  hasAccount: boolean
  currency: VaCurrency
  accountNumber?: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  bic?: string
  bankName?: string
  bankAddress?: string
  accountHolderName?: string
  status?: string
  source?: "db" | "noah"
}

const VA_CURRENCIES = new Set<VaCurrency>(["usd", "eur", "gbp"])

function parseCurrencyList(url: URL): VaCurrency[] | { error: string } {
  const currenciesParam = String(url.searchParams.get("currencies") ?? "").trim()
  if (currenciesParam) {
    const parsed = currenciesParam
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean) as VaCurrency[]
    const unique = [...new Set(parsed)]
    if (!unique.length || unique.some((c) => !VA_CURRENCIES.has(c))) {
      return { error: "currencies must be usd, eur, and/or gbp" }
    }
    return unique
  }
  const currency = (url.searchParams.get("currency") || "usd").toLowerCase() as VaCurrency
  if (!VA_CURRENCIES.has(currency)) {
    return { error: "currency must be usd, eur, or gbp" }
  }
  return [currency]
}

function selectPmForCurrency(
  all: Awaited<ReturnType<typeof fetchAllPaymentMethodsForCustomer>>,
  currency: VaCurrency,
) {
  if (currency === "usd") return selectPreferredUsdPayinPaymentMethod(all)
  if (currency === "eur") return selectPreferredEurPayinPaymentMethod(all)
  return all.find((p) => {
    const caps = p.Capabilities as Record<string, unknown> | undefined
    return !(caps && caps.PayinTo === false)
  })
}

function accountJsonFromDb(
  currency: VaCurrency,
  cached: NonNullable<Awaited<ReturnType<typeof getVirtualAccountDisplayFromDb>>>,
): VaAccountJson {
  return {
    hasAccount: true,
    currency,
    accountNumber: cached.accountNumber,
    routingNumber: cached.routingNumber,
    sortCode: cached.sortCode,
    iban: cached.iban,
    bic: currency === "usd" ? undefined : cached.bic,
    bankName: cached.bankName,
    bankAddress: cached.bankAddress,
    accountHolderName: cached.accountHolderName,
    status: cached.status,
    source: "db",
  }
}

async function resolveAccountsForCurrencies(input: {
  admin: SupabaseClient
  ctx: NoahAccountContext
  currencies: VaCurrency[]
}): Promise<Record<string, VaAccountJson>> {
  const { admin, ctx, currencies } = input
  const { noahCustomerId, subjectUserId, subjectBusinessId } = ctx

  const dbHits = await Promise.all(
    currencies.map(async (currency) => {
      const cached = await getVirtualAccountDisplayFromDb(admin, {
        currency,
        userId: subjectUserId,
        businessId: subjectBusinessId,
      })
      return [currency, cached] as const
    }),
  )

  const accounts: Record<string, VaAccountJson> = {}
  const missing: VaCurrency[] = []
  for (const [currency, cached] of dbHits) {
    if (cached?.hasAccount) {
      accounts[currency.toUpperCase()] = accountJsonFromDb(currency, cached)
    } else {
      missing.push(currency)
    }
  }

  if (!missing.length) return accounts

  const approved = await isNoahVerificationApproved(admin, {
    subjectUserId,
    scope: ctx.scope,
    subjectBusinessId,
  })
  if (!approved) {
    for (const currency of missing) {
      accounts[currency.toUpperCase()] = { hasAccount: false, currency }
    }
    return accounts
  }

  await provisionNoahArtifactsForCustomer({
    subjectUserId,
    subjectBusinessId,
    noahCustomerId,
    scope: ctx.scope,
    admin,
  })

  const all = await fetchAllPaymentMethodsForCustomer(noahCustomerId)
  for (const currency of missing) {
    const pm = selectPmForCurrency(all, currency)
    if (!pm) {
      accounts[currency.toUpperCase()] = { hasAccount: false, currency }
      continue
    }
    const display = mapPaymentMethodToVirtualAccountDisplay(pm, currency)
    await persistVirtualAccountFromPaymentMethod(
      subjectUserId,
      currency,
      pm,
      subjectBusinessId,
      noahCustomerId,
    )
    accounts[currency.toUpperCase()] = {
      hasAccount: true,
      currency,
      accountNumber: display.accountNumber,
      routingNumber: display.routingNumber,
      sortCode: display.sortCode,
      iban: display.iban,
      bic: currency === "usd" ? undefined : display.bic,
      bankName: display.bankName,
      bankAddress: display.bankAddress,
      accountHolderName: display.accountHolderName,
      status: display.status,
      source: "noah",
    }
  }

  return accounts
}

export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const url = new URL(request.url)
  const parsed = parseCurrencyList(url)
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const currencies = parsed

  for (const currency of currencies) {
    const guardCurrency = await ensureCurrencyUsable(currency.toUpperCase())
    if (!guardCurrency.ok) {
      return NextResponse.json({ error: guardCurrency.reason, code: "CURRENCY_DISABLED" }, { status: 403 })
    }
  }

  const admin = createSupabaseAdmin()
  try {
    const accounts = await resolveAccountsForCurrencies({
      admin,
      ctx: acc.ctx,
      currencies,
    })

    // Legacy single-currency response shape.
    if (!url.searchParams.get("currencies") && currencies.length === 1) {
      const only = accounts[currencies[0].toUpperCase()]
      return NextResponse.json(only ?? { hasAccount: false, currency: currencies[0] })
    }

    return NextResponse.json({ accounts })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

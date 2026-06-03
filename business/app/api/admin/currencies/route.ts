import { resolveDisplayCurrencySymbol } from "@easner/shared"
import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  filterOfficeFiatCurrencies,
  filterOfficeRatesCurrencies,
} from "@/lib/admin/office-catalog-currencies"
import { addCurrencyWithRateMatrix, ensureCurrenciesFromExchangeRates } from "@/lib/admin/rates-service"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get("scope")

  const admin = createSupabaseAdmin()
  let { data, error } = await admin.from("currencies").select("*").order("code", { ascending: true })

  if (error) {
    const msg = error.message ?? ""
    if (msg.includes("currencies") && msg.includes("schema cache")) {
      return NextResponse.json(
        {
          error:
            "Table public.currencies is missing. Apply migration 20250526000000_platform_control_currencies_exchange_rates.sql (Supabase SQL editor or db push).",
        },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if ((data ?? []).length === 0) {
    try {
      await ensureCurrenciesFromExchangeRates(admin)
      const refreshed = await admin.from("currencies").select("*").order("code", { ascending: true })
      if (refreshed.error) return NextResponse.json({ error: refreshed.error.message }, { status: 500 })
      data = refreshed.data
    } catch (e) {
      console.warn("[currencies] bootstrap from exchange_rates:", e)
    }
  }

  let currencies = data ?? []

  if (scope === "fiat") {
    currencies = filterOfficeFiatCurrencies(currencies)
  } else if (scope === "rates" || scope === "payment-methods") {
    const { data: pmRows } = await admin.from("payment_methods").select("currency")
    const paymentMethodCodes = new Set(
      (pmRows ?? []).map((r) => String((r as { currency?: string }).currency ?? "").toUpperCase()).filter(Boolean),
    )
    currencies = filterOfficeRatesCurrencies(currencies, {
      paymentMethodCodes: scope === "rates" ? paymentMethodCodes : undefined,
    })
  }

  const normalized = currencies.map((row) => {
    const code = String((row as { code?: string }).code ?? "")
    return {
      ...row,
      symbol: resolveDisplayCurrencySymbol(code, (row as { symbol?: string }).symbol),
    }
  })

  return NextResponse.json({ currencies: normalized })
}

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body?.code || !body?.name || !body?.symbol) {
    return NextResponse.json({ error: "code, name, and symbol are required" }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const currency = await addCurrencyWithRateMatrix(admin, {
      code: String(body.code),
      name: String(body.name),
      symbol: String(body.symbol),
      flag_svg: body.flag_svg != null ? String(body.flag_svg) : null,
      status: body.status != null ? String(body.status) : "active",
      can_send: body.can_send !== false,
      can_receive: body.can_receive !== false,
    })
    return NextResponse.json({ currency })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add currency" },
      { status: 400 },
    )
  }
}

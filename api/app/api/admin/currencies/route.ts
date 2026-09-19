import { resolveDisplayCurrencySymbol } from "@easner/shared"
import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  filterOfficeFiatCurrencies,
  filterOfficeReportingFxCurrencies,
} from "@/lib/admin/office-catalog-currencies"
import { ensureCurrenciesFromExchangeRates, ensureReportingFxMatrix } from "@/lib/admin/rates-service"
import { isReportingFxCurrencyCode } from "@/lib/fx/reporting-fx"

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
  } else if (scope === "rates") {
    currencies = filterOfficeReportingFxCurrencies(currencies)
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
  const code = String(body?.code ?? "").trim().toUpperCase()
  if (!code || !isReportingFxCurrencyCode(code)) {
    return NextResponse.json(
      {
        error:
          "Reporting FX uses fixed base currencies (USD, EUR, GBP, NGN). Use Platform → Reporting FX → Sync rates.",
      },
      { status: 400 },
    )
  }

  try {
    const admin = createSupabaseAdmin()
    await ensureReportingFxMatrix(admin)
    const { data, error } = await admin.from("currencies").select("*").eq("code", code).maybeSingle()
    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: "Currency bootstrap failed" }, { status: 500 })
    }
    return NextResponse.json({ currency: data })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to ensure reporting currency" },
      { status: 400 },
    )
  }
}

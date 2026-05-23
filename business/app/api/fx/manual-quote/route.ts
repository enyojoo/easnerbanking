import { NextResponse } from "next/server"
import { getUserFromApiRequest, createSupabaseAdmin } from "@/lib/supabase/admin"
import { fxEngine, type ExchangeRate } from "@easner/shared"

export const runtime = "nodejs"

type Body = {
  direction?: "send" | "receive"
  amount?: number
  fromCurrency?: string
  toCurrency?: string
}

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as Body | null
  const direction = body?.direction === "receive" ? "receive" : "send"
  const amount = Number(body?.amount)
  const fromCurrency = String(body?.fromCurrency ?? "").trim().toUpperCase()
  const toCurrency = String(body?.toCurrency ?? "").trim().toUpperCase()

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 })
  }
  if (!fromCurrency || !toCurrency) {
    return NextResponse.json({ error: "fromCurrency and toCurrency are required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from("exchange_rates").select("*").eq("status", "active")
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const exchangeRates = (data ?? []) as ExchangeRate[]
  if (!fxEngine.validateRate(exchangeRates, fromCurrency, toCurrency)) {
    return NextResponse.json(
      { error: `No active rate for ${fromCurrency} → ${toCurrency}` },
      { status: 404 },
    )
  }

  const rateRow = fxEngine.getRate(exchangeRates, fromCurrency, toCurrency)

  try {
    const order = fxEngine.calculateOrderAmounts({
      direction,
      amount,
      fromCurrency,
      toCurrency,
      exchangeRates,
    })

    return NextResponse.json({
      ...order,
      fromCurrency,
      toCurrency,
      direction,
      inputAmount: amount,
      minAmount: rateRow?.min_amount ?? null,
      maxAmount: rateRow?.max_amount ?? null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

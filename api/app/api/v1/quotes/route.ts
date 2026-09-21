import { NextResponse } from "next/server"
import { createPlatformQuote } from "@/lib/platform/objects"
import { logPlatformApi, parseMinorAmount, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "transfers.write")
  if (!auth.ok) return auth.response
  const livemode = auth.ctx.mode === "live"
  const body = (await request.json().catch(() => null)) as {
    amount?: number
    currency?: string
    receive_currency?: string
    source?: string
    destination?: string
  } | null
  const amount = parseMinorAmount(body?.amount)
  if (!amount) return v1Error(400, "invalid_amount", "amount must be a positive integer in cents")
  const source = String(body?.source ?? "").trim()
  if (!source) return v1Error(400, "invalid_source", "source is required")
  const currency = String(body?.currency ?? "usd").trim().toUpperCase()
  try {
    const quote = await createPlatformQuote(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      sourceAccountId: source,
      destinationId: body?.destination ?? null,
      amountCents: amount,
      sendCurrency: currency,
      receiveCurrency: body?.receive_currency,
    })
    await logPlatformApi(admin, {
      startedAt: auth.ctx.startedAt,
      idempotencyKey: auth.ctx.idempotencyKey,
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: "/v1/quotes",
      status: 201,
    })
    return NextResponse.json(quote, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create quote"
    return v1Error(400, "create_failed", message)
  }
}

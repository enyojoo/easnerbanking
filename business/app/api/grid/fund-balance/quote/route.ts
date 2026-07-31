import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { previewGridFundBalanceQuote } from "@/lib/grid/fund-balance-session"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const ctx = await resolveNoahContextAsync(auth.user.id, request)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const currency = String(body?.currency ?? "").trim().toUpperCase()
  const country = String(body?.country ?? "").trim().toUpperCase()
  if (!currency || !country) {
    return NextResponse.json({ error: "currency and country required" }, { status: 400 })
  }

  const rail = body?.rail === "mobile_money" ? "mobile_money" : "bank_transfer"
  const admin = createSupabaseAdmin()

  try {
    const preview = await previewGridFundBalanceQuote({
      admin,
      userId: auth.user.id,
      businessId: ctx.businessId,
      country,
      currency,
      rail,
      usdCredit: body?.usdCredit != null && Number(body.usdCredit) > 0 ? Number(body.usdCredit) : undefined,
      localPayIn: body?.localPayIn != null && Number(body.localPayIn) > 0 ? Number(body.localPayIn) : undefined,
    })
    return NextResponse.json({
      ok: true,
      provider: "grid",
      quotePhase: "preview",
      requiresConfirm: true,
      localPayIn: preview.localPayIn,
      usdCredit: preview.usdCredit,
      customerRate: preview.customerRate,
      processingFee: preview.processingFee,
      displayProcessingFee: preview.displayProcessingFee,
      displayProcessingFeeLocal: preview.displayProcessingFeeLocal,
      displayProcessingFeeCurrency: preview.displayProcessingFeeCurrency,
      provisionalPayIn: preview.provisionalPayIn,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "grid_fund_balance_quote_failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

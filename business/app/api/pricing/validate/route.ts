import { NextResponse } from "next/server"
import { requirePricingAuth } from "../_helpers"
import { validateQuote } from "@/lib/pricing/evaluator"

export async function POST(request: Request) {
  const auth = await requirePricingAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const body = (await request.json().catch(() => null)) as { quoteId?: string } | null
  const quoteId = String(body?.quoteId || "").trim()
  if (!quoteId) {
    return NextResponse.json({ error: "Missing quoteId" }, { status: 400 })
  }

  try {
    const quote = await validateQuote(user.id, quoteId)
    return NextResponse.json({
      ok: true,
      quote,
      repricing: {
        reasonCode: quote.repricing_reason_code || null,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}

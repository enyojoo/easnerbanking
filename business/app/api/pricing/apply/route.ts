import { NextResponse } from "next/server"
import { requirePricingAuth } from "../_helpers"
import { applyQuote } from "@/lib/pricing/evaluator"

export async function POST(request: Request) {
  const auth = await requirePricingAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const body = (await request.json().catch(() => null)) as
    | { quoteId?: string; transactionId?: string | null }
    | null
  const quoteId = String(body?.quoteId || "").trim()
  if (!quoteId) {
    return NextResponse.json({ error: "Missing quoteId" }, { status: 400 })
  }

  try {
    const result = await applyQuote({
      userId: user.id,
      quoteId,
      transactionId: body?.transactionId ?? null,
    })
    return NextResponse.json({
      ok: true,
      ...result,
      repricing: {
        reasonCode: null,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}

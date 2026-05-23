import { NextResponse } from "next/server"
import { getUserFromApiRequest, createSupabaseAdmin } from "@/lib/supabase/admin"
import { createManualSendOrder, type ManualSendQuoteSnapshot } from "@/lib/manual-send/create-order"
import { toPublicPaymentMethodDetail } from "@/lib/manual-send/public-payment-method"

export const runtime = "nodejs"

type Body = {
  recipientId?: string
  paymentMethodId?: string
  quote?: ManualSendQuoteSnapshot
  receiptUrl?: string | null
  referenceCode?: string
}

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as Body | null
  const recipientId = String(body?.recipientId ?? "").trim()
  const paymentMethodId = String(body?.paymentMethodId ?? "").trim()
  const quote = body?.quote

  if (!recipientId || !paymentMethodId || !quote) {
    return NextResponse.json(
      { error: "recipientId, paymentMethodId, and quote are required" },
      { status: 400 },
    )
  }

  const admin = createSupabaseAdmin()

  const { data: recipient, error: recErr } = await admin
    .from("recipients")
    .select("id,user_id")
    .eq("id", recipientId)
    .maybeSingle()

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })
  if (!recipient || String(recipient.user_id) !== user.id) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 })
  }

  const { data: pm, error: pmErr } = await admin
    .from("payment_methods")
    .select("*")
    .eq("id", paymentMethodId)
    .eq("status", "active")
    .maybeSingle()

  if (pmErr) return NextResponse.json({ error: pmErr.message }, { status: 500 })
  if (!pm) {
    return NextResponse.json({ error: "Payment method not found" }, { status: 404 })
  }

  const pmCurrency = String(pm.currency ?? "").toUpperCase()
  if (pmCurrency !== String(quote.fromCurrency ?? "").toUpperCase()) {
    return NextResponse.json({ error: "Payment method currency mismatch" }, { status: 400 })
  }

  try {
    const { transactionId, referenceCode } = await createManualSendOrder(admin, {
      userId: user.id,
      recipientId,
      paymentMethodId,
      quote,
      paymentMethodSnapshot: toPublicPaymentMethodDetail(pm as Record<string, unknown>),
      receiptUrl: body?.receiptUrl ?? null,
      referenceCode: body?.referenceCode ?? undefined,
    })

    return NextResponse.json({ transactionId, referenceCode })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

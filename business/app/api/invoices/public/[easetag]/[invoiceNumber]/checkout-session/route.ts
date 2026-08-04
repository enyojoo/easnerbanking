import { NextResponse } from "next/server"
import type { B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { createInvoiceCheckoutSession } from "@/lib/stripe/create-invoice-checkout"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Public: create Stripe Checkout Session client_secret for invoice Pay online. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ easetag: string; invoiceNumber: string }> },
) {
  if (!isStripeInvoicePaymentsEnabled()) {
    return NextResponse.json({ error: "Stripe invoice payments are not enabled" }, { status: 503 })
  }

  const { easetag, invoiceNumber } = await params
  if (!easetag?.trim() || !invoiceNumber?.trim()) {
    return NextResponse.json({ error: "Missing easetag or invoice number" }, { status: 400 })
  }

  const cleanTag = normalizeEasetag(easetag)
  if (!cleanTag) {
    return NextResponse.json({ error: "Invalid easetag" }, { status: 400 })
  }

  const decodedNumber = decodeURIComponent(invoiceNumber).trim().toLowerCase()
  if (!decodedNumber) {
    return NextResponse.json({ error: "Invalid invoice number" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: biz, error: bizError } = await admin
    .from("businesses")
    .select("id,name")
    .eq("easetag", cleanTag)
    .maybeSingle()

  if (bizError) {
    return NextResponse.json({ error: bizError.message }, { status: 500 })
  }
  if (!biz?.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { data, error } = await admin
    .from("invoices")
    .select("*")
    .eq("business_id", biz.id as string)
    .ilike("invoice_number", decodedNumber)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const result = await createInvoiceCheckoutSession(admin, {
    businessId: biz.id as string,
    invoiceRow: data as B2bInvoiceRow,
    businessName: typeof biz.name === "string" ? biz.name : null,
    easetag: cleanTag,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    clientSecret: result.clientSecret,
    publishableKey: result.publishableKey,
    checkoutSessionId: result.checkoutSessionId,
    settlementId: result.settlementId,
  })
}

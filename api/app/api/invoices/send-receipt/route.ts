import { NextRequest, NextResponse } from "next/server"
import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { deliverInvoiceReceiptEmail } from "@/lib/invoices/deliver-invoice-receipt-email"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/** Merchant action: email (or re-email) the paid invoice receipt to the customer. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireBusinessOrg(request)
    if (!ctx.ok) return ctx.response

    const body = (await request.json().catch(() => ({}))) as {
      invoiceId?: string
      invoice?: { id?: string }
    }
    const invoiceId =
      (typeof body.invoiceId === "string" && body.invoiceId.trim()) ||
      (typeof body.invoice?.id === "string" && body.invoice.id.trim()) ||
      ""

    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 })
    }

    const admin = createSupabaseAdmin()
    const { data: row, error } = await admin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    const b2b = row as B2bInvoiceRow
    if (b2b.business_id !== ctx.businessId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const invoice = mapRowToInvoice(b2b)
    if (invoice.status !== "paid") {
      return NextResponse.json(
        { error: "Receipt emails can only be sent for paid invoices" },
        { status: 400 },
      )
    }
    if (!invoice.customerEmail?.trim()) {
      return NextResponse.json({ error: "Invoice has no customer email" }, { status: 400 })
    }

    const { data: biz } = await admin
      .from("businesses")
      .select("easetag")
      .eq("id", ctx.businessId)
      .maybeSingle()
    const easetag =
      typeof biz?.easetag === "string" && biz.easetag.trim() ? biz.easetag.trim() : null

    const result = await deliverInvoiceReceiptEmail(admin, {
      businessId: ctx.businessId,
      invoice,
      actorUserId: ctx.userId,
      easetag,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ ok: true, to: result.to })
  } catch (e) {
    console.error("send-receipt:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send receipt" },
      { status: 500 },
    )
  }
}

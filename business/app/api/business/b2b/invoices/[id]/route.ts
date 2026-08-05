import { NextResponse } from "next/server"
import {
  mapRowToInvoice,
  invoiceToDbPayload,
  mergeInvoicePatch,
  patchKeysFromBody,
  resolvePatchCustomerId,
  type B2bInvoiceRow,
} from "@/lib/b2b/map-invoice"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import type { Invoice } from "@/lib/b2b/types"
import { writeInvoiceAuditLog } from "@/lib/invoices/invoice-audit-log"
import { dispatchInvoiceWebhooks } from "@/lib/invoices/invoice-webhooks"
import { parseBusinessInvoiceSettings } from "@/lib/invoices/invoice-settings"
import { deliverInvoiceReceiptEmail } from "@/lib/invoices/deliver-invoice-receipt-email"
import { notifyMerchantInvoicePaid } from "@/lib/invoices/notify-invoice-paid"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/** Single-invoice fetch for the invoice detail page (`useInvoiceDetail`). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response
  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }
  return NextResponse.json(mapRowToInvoice(data as B2bInvoiceRow))
}

function webhookEventForStatus(status: string): Parameters<typeof dispatchInvoiceWebhooks>[0]["event"] | null {
  if (status === "unpaid") return "invoice.finalized"
  if (status === "sent") return "invoice.sent"
  if (status === "paid") return "invoice.paid"
  if (status === "past_due") return "invoice.past_due"
  if (status === "void") return "invoice.voided"
  return null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response
  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: existing, error: fetchErr } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  const existingRow = existing as B2bInvoiceRow
  const existingInvoice = mapRowToInvoice(existingRow)
  const patchKeys = patchKeysFromBody(body)
  const patch = body as Partial<Invoice>
  const merged = mergeInvoicePatch(existingInvoice, patch, patchKeys)

  const customerId = resolvePatchCustomerId(patch, patchKeys, existingRow.customer_id)

  if (customerId) {
    const { data: cust } = await admin
      .from("business_customers")
      .select("id")
      .eq("id", customerId)
      .eq("business_id", ctx.businessId)
      .maybeSingle()
    if (!cust) {
      return NextResponse.json({ error: "Customer not found for this business" }, { status: 400 })
    }
  }

  const payload = invoiceToDbPayload({
    businessId: ctx.businessId,
    customerId,
    invoice: { ...merged, id },
    invoiceNumber: existingRow.invoice_number,
  })

  const { data, error } = await admin
    .from("invoices")
    .update(payload)
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .select("*")
    .single()

  if (error) {
    console.error("invoices PATCH:", error)
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: 500 },
    )
  }

  const updated = mapRowToInvoice(data as B2bInvoiceRow)

  void writeInvoiceAuditLog({
    invoiceId: id,
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: patchKeys.has("status") ? "status_changed" : "edited",
    changes: {
      before: { status: existingInvoice.status },
      after: { status: updated.status },
      patchKeys: [...patchKeys],
    },
  })

  if (existingInvoice.status !== updated.status) {
    const ev = webhookEventForStatus(updated.status)
    if (ev) {
      void dispatchInvoiceWebhooks({
        businessId: ctx.businessId,
        event: ev,
        payload: { invoiceId: id, invoiceNumber: updated.invoiceNumber, status: updated.status },
      })
    }
  }

  if (existingInvoice.status !== "paid" && updated.status === "paid") {
    const { data: biz } = await admin
      .from("businesses")
      .select("invoice_settings, easetag, name")
      .eq("id", ctx.businessId)
      .maybeSingle()
    const settings = parseBusinessInvoiceSettings(biz?.invoice_settings)

    void notifyMerchantInvoicePaid(admin, {
      businessId: ctx.businessId,
      invoice: updated,
      invoiceSettingsRaw: biz?.invoice_settings,
    }).catch((e) => console.error("paid merchant email:", e))

    if (settings.sendReceiptOnPaid !== false && updated.customerEmail?.trim()) {
      const easetag =
        typeof biz?.easetag === "string" && biz.easetag.trim() ? biz.easetag.trim() : null
      void deliverInvoiceReceiptEmail(admin, {
        businessId: ctx.businessId,
        invoice: updated,
        actorUserId: ctx.userId,
        easetag,
      }).then((result) => {
        if (!result.ok) console.error("paid receipt email:", result.error)
      })
    }
  }

  return NextResponse.json({ invoice: updated })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusinessOrg(_request)
  if (!ctx.ok) return ctx.response
  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { error } = await admin.from("invoices").delete().eq("id", id).eq("business_id", ctx.businessId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

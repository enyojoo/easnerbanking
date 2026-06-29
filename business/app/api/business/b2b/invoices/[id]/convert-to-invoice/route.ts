import { NextResponse } from "next/server"
import {
  mapRowToInvoice,
  invoiceToDbPayload,
  type B2bInvoiceRow,
} from "@/lib/b2b/map-invoice"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { generateInvoiceId, formatInvoiceNumberFromClientId } from "@/lib/invoice-id"
import { writeInvoiceAuditLog } from "@/lib/invoices/invoice-audit-log"
import { dispatchInvoiceWebhooks } from "@/lib/invoices/invoice-webhooks"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/** Convert a quote to a payable invoice (new row). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response
  const { id } = await params

  const admin = createSupabaseAdmin()
  const { data: existing, error } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const source = mapRowToInvoice(existing as B2bInvoiceRow)
  if (source.status !== "quote" && source.documentType !== "quote") {
    return NextResponse.json({ error: "Invoice is not a quote" }, { status: 400 })
  }

  const newId = generateInvoiceId()
  const now = new Date().toISOString()
  const open = {
    ...source,
    id: newId,
    invoiceNumber: formatInvoiceNumberFromClientId(newId),
    status: "open" as const,
    documentType: "invoice" as const,
    finalizedDate: now,
    createdDate: now,
    statusHistory: [{ status: "open", timestamp: now }],
  }

  const payload = invoiceToDbPayload({
    businessId: ctx.businessId,
    customerId: (existing as B2bInvoiceRow).customer_id,
    invoice: open,
  })
  payload.created_at = now

  const { data: inserted, error: insErr } = await admin
    .from("invoices")
    .insert(payload)
    .select("*")
    .single()

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  void writeInvoiceAuditLog({
    invoiceId: newId,
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "converted",
    changes: { fromQuoteId: id },
  })

  void dispatchInvoiceWebhooks({
    businessId: ctx.businessId,
    event: "invoice.finalized",
    payload: { invoiceId: newId, fromQuoteId: id },
  })

  return NextResponse.json({ invoice: mapRowToInvoice(inserted as B2bInvoiceRow) })
}

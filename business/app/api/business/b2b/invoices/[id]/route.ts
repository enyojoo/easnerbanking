import { NextResponse } from "next/server"
import {
  mapRowToInvoice,
  invoiceToDbPayload,
  isUuid,
  type B2bInvoiceRow,
} from "@/lib/b2b/map-invoice"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import type { Invoice } from "@/lib/b2b/types"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response
  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  let invoice: Invoice
  try {
    invoice = (await request.json()) as Invoice
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

  const rawCustomerId =
    typeof invoice.customerId === "string" && invoice.customerId.trim().length > 0
      ? invoice.customerId.trim()
      : null
  const customerId = rawCustomerId && isUuid(rawCustomerId) ? rawCustomerId : null

  if (customerId) {
    const { data: cust } = await admin
      .from("b2b_customers")
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
    invoice: { ...invoice, id },
    invoiceNumber: (existing as B2bInvoiceRow).invoice_number,
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
  return NextResponse.json({ invoice: mapRowToInvoice(data as B2bInvoiceRow) })
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

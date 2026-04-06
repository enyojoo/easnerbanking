import { NextResponse } from "next/server"
import { mapRowToInvoice, invoiceToDbPayload, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import type { Invoice } from "@/lib/b2b/types"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("invoices")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const invoices = (data ?? []).map((row) => mapRowToInvoice(row as B2bInvoiceRow))
  return NextResponse.json({ invoices })
}

export async function POST(request: Request) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  let invoice: Invoice
  try {
    invoice = (await request.json()) as Invoice
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!invoice.invoiceNumber?.trim()) {
    return NextResponse.json({ error: "invoiceNumber is required" }, { status: 400 })
  }

  const customerId =
    typeof invoice.customerId === "string" && invoice.customerId.length > 0
      ? invoice.customerId
      : null

  const admin = createSupabaseAdmin()

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
    invoice,
  })
  delete (payload as { updated_at?: string }).updated_at
  const { data, error } = await admin.from("invoices").insert(payload).select("*").single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ invoice: mapRowToInvoice(data as B2bInvoiceRow) })
}

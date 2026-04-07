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

  const rawInvNum =
    typeof invoice.invoiceNumber === "string"
      ? invoice.invoiceNumber.trim()
      : invoice.invoiceNumber != null && typeof invoice.invoiceNumber === "number"
        ? String(invoice.invoiceNumber)
        : ""
  if (!rawInvNum) {
    return NextResponse.json({ error: "invoiceNumber is required" }, { status: 400 })
  }

  const rawCustomerId =
    typeof invoice.customerId === "string" && invoice.customerId.trim().length > 0
      ? invoice.customerId.trim()
      : null
  const customerId = rawCustomerId && isUuid(rawCustomerId) ? rawCustomerId : null

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

  let payload: Record<string, unknown>
  try {
    payload = invoiceToDbPayload({
      businessId: ctx.businessId,
      customerId,
      invoice,
    })
  } catch (e) {
    console.error("invoiceToDbPayload:", e)
    const msg = e instanceof Error ? e.message : "Invalid invoice payload"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  delete (payload as { updated_at?: string }).updated_at
  const { data, error } = await admin.from("invoices").insert(payload).select("*").single()

  if (error) {
    console.error("invoices POST insert:", error)
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ invoice: mapRowToInvoice(data as B2bInvoiceRow) })
}

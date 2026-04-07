import { NextResponse } from "next/server"
import type { B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { jsonPublicInvoiceFromRow } from "@/lib/invoices/json-public-invoice-from-row"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/** Public read by business easetag + invoice number (readable share link; no Supabase ids in URL). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ easetag: string; invoiceNumber: string }> },
) {
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
    .select("id")
    .eq("easetag", cleanTag)
    .maybeSingle()

  if (bizError) {
    return NextResponse.json({ error: bizError.message }, { status: 500 })
  }
  if (!biz?.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  /** Case-insensitive match (URL segment is lowercased; DB may store EINV-… uppercase). */
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

  const payload = await jsonPublicInvoiceFromRow(admin, data as B2bInvoiceRow)
  return NextResponse.json(payload)
}

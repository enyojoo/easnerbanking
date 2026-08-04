import { NextResponse } from "next/server"
import type { B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { jsonPublicInvoiceFromRow } from "@/lib/invoices/json-public-invoice-from-row"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/** Public read by invoice row id (legacy share link). UUID acts as an unguessable capability token. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from("invoices").select("*").eq("id", id).maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const payload = await jsonPublicInvoiceFromRow(admin, data as B2bInvoiceRow)
  if (!payload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json(payload)
}

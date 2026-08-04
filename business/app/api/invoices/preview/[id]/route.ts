import { NextResponse } from "next/server"
import type { B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { jsonPublicInvoiceFromRow } from "@/lib/invoices/json-public-invoice-from-row"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/** Authenticated business preview — same payload as public invoice view, scoped to org. */
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
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const payload = await jsonPublicInvoiceFromRow(admin, data as B2bInvoiceRow, { allowDraft: true })
  if (!payload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json(payload)
}

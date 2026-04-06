import { NextResponse } from "next/server"
import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { fetchInvoiceIssuerForBusiness } from "@/lib/invoices/issuer"
import { resolvePayInForBusiness } from "@/lib/invoices/resolve-pay-in-for-business"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/** Public read by id (share link). UUID acts as an unguessable capability token. */
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

  const row = data as B2bInvoiceRow
  const invoice = mapRowToInvoice(row)
  const businessId = row.business_id

  const issuer = await fetchInvoiceIssuerForBusiness(admin, businessId)

  const payableStatuses = ["open", "sent", "past_due"] as const
  const payable = payableStatuses.includes(
    invoice.status as (typeof payableStatuses)[number],
  )

  let payIn: Awaited<ReturnType<typeof resolvePayInForBusiness>> = {}
  if (payable) {
    payIn = await resolvePayInForBusiness(businessId, invoice.currency, {
      persistVirtualAccount: false,
    })
  }

  return NextResponse.json({ invoice, issuer, payIn })
}

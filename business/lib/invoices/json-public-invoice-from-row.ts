import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { fetchInvoiceIssuerForBusiness } from "@/lib/invoices/issuer"
import { resolvePayInForBusiness } from "@/lib/invoices/resolve-pay-in-for-business"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function jsonPublicInvoiceFromRow(
  admin: ReturnType<typeof createSupabaseAdmin>,
  row: B2bInvoiceRow,
) {
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

  const { data: bizRow } = await admin
    .from("businesses")
    .select("easetag")
    .eq("id", businessId)
    .maybeSingle()
  const businessEasetag =
    typeof bizRow?.easetag === "string" && bizRow.easetag.trim() ? bizRow.easetag.trim() : null

  return { invoice, issuer, payIn, businessEasetag }
}

import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { fetchInvoiceIssuerForBusiness } from "@/lib/invoices/issuer"
import { resolvePayInForBusiness } from "@/lib/invoices/resolve-pay-in-for-business"
import { parseBusinessInvoiceSettings } from "@/lib/invoices/invoice-settings"
import { resolvePaymentDisplay } from "@/lib/invoices/resolve-payment-display"
import { filterPayInByDisplay } from "@/lib/invoices/filter-pay-in-by-display"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function jsonPublicInvoiceFromRow(
  admin: ReturnType<typeof createSupabaseAdmin>,
  row: B2bInvoiceRow,
) {
  const invoice = mapRowToInvoice(row)
  const businessId = row.business_id
  const issuer = await fetchInvoiceIssuerForBusiness(admin, businessId)

  const payableStatuses = ["open", "sent", "past_due"] as const
  const isQuote =
    invoice.status === "quote" || invoice.documentType === "quote"
  const payable =
    !isQuote &&
    payableStatuses.includes(invoice.status as (typeof payableStatuses)[number])

  let payIn: Awaited<ReturnType<typeof resolvePayInForBusiness>> = {}
  if (payable) {
    payIn = await resolvePayInForBusiness(businessId, invoice.currency, {
      persistVirtualAccount: false,
    })
  }

  const { data: bizRow } = await admin
    .from("businesses")
    .select("easetag, invoice_settings, logo_url")
    .eq("id", businessId)
    .maybeSingle()
  const businessEasetag =
    typeof bizRow?.easetag === "string" && bizRow.easetag.trim() ? bizRow.easetag.trim() : null

  const invoiceSettings = parseBusinessInvoiceSettings(bizRow?.invoice_settings)
  const stripeOnlineEnabled = isStripeInvoicePaymentsEnabled()
  const paymentDisplay = resolvePaymentDisplay({
    invoice,
    businessDefaults: invoiceSettings,
    payIn,
    payable,
    stripeOnlineEnabled,
  })
  const filteredPayIn = filterPayInByDisplay(payIn, paymentDisplay)

  return {
    invoice,
    issuer: {
      ...issuer,
      logoUrl: typeof bizRow?.logo_url === "string" ? bizRow.logo_url : undefined,
    },
    payIn: filteredPayIn,
    paymentDisplay,
    invoiceSettings,
    businessEasetag,
    stripeOnlineEnabled,
  }
}

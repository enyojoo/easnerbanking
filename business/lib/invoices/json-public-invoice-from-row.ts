import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { fetchInvoiceIssuerForBusiness } from "@/lib/invoices/issuer"
import { resolvePayInForBusiness } from "@/lib/invoices/resolve-pay-in-for-business"
import { parseBusinessInvoiceSettings } from "@/lib/invoices/invoice-settings"
import { resolvePaymentDisplay } from "@/lib/invoices/resolve-payment-display"
import { filterPayInByDisplay } from "@/lib/invoices/filter-pay-in-by-display"
import { isInvoicePayableStatus, isInvoicePubliclyViewable } from "@/lib/invoices/invoice-status"
import { resolveConnectReadyForCheckout } from "@/lib/stripe/connect"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { createInvoiceCheckoutSession } from "@/lib/stripe/create-invoice-checkout"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export type PublicInvoiceStripeCheckout = {
  clientSecret: string
  publishableKey: string
}

export type PublicInvoicePayload = {
  invoice: ReturnType<typeof mapRowToInvoice>
  issuer: Awaited<ReturnType<typeof fetchInvoiceIssuerForBusiness>> & { logoUrl?: string }
  payIn: Awaited<ReturnType<typeof resolvePayInForBusiness>>
  paymentDisplay: ReturnType<typeof resolvePaymentDisplay>
  invoiceSettings: ReturnType<typeof parseBusinessInvoiceSettings>
  businessEasetag: string | null
  stripeOnlineEnabled: boolean
  stripeCheckout: PublicInvoiceStripeCheckout | null
}

export async function jsonPublicInvoiceFromRow(
  admin: ReturnType<typeof createSupabaseAdmin>,
  row: B2bInvoiceRow,
  options?: { allowDraft?: boolean },
): Promise<PublicInvoicePayload | null> {
  const invoice = mapRowToInvoice(row)
  if (!options?.allowDraft && !isInvoicePubliclyViewable(invoice.status)) {
    return null
  }

  const businessId = row.business_id
  const issuer = await fetchInvoiceIssuerForBusiness(admin, businessId)
  const payable = isInvoicePayableStatus(invoice.status)

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
  const stripePlatformEnabled = isStripeInvoicePaymentsEnabled()
  let stripeConnectReady = false
  if (stripePlatformEnabled) {
    const connect = await resolveConnectReadyForCheckout(admin, businessId, {
      currency: invoice.currency,
    })
    stripeConnectReady = connect.ready
  }
  const stripeOnlineEnabled = stripePlatformEnabled && stripeConnectReady
  const paymentDisplay = resolvePaymentDisplay({
    invoice,
    businessDefaults: invoiceSettings,
    payIn,
    payable,
    stripeOnlineEnabled: stripePlatformEnabled,
    stripeConnectReady,
  })
  const filteredPayIn = filterPayInByDisplay(payIn, paymentDisplay)

  let stripeCheckout: PublicInvoiceStripeCheckout | null = null
  if (paymentDisplay.showOnlinePayment && stripeOnlineEnabled && payable) {
    const checkout = await createInvoiceCheckoutSession(admin, {
      businessId,
      invoiceRow: row,
      businessName: issuer.name,
      easetag: businessEasetag,
    })
    if (checkout.ok) {
      stripeCheckout = {
        clientSecret: checkout.clientSecret,
        publishableKey: checkout.publishableKey,
      }
    }
  }

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
    stripeCheckout,
  }
}

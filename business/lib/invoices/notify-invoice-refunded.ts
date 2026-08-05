import type { SupabaseClient } from "@supabase/supabase-js"
import type { Invoice } from "@/lib/b2b/types"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  fetchInvoiceIssuerForBusiness,
  resolveInvoiceReplyEmail,
} from "@/lib/invoices/issuer"
import { parseBusinessInvoiceSettings } from "@/lib/invoices/invoice-settings"
import { buildInvoiceCustomerViewUrl } from "@/lib/invoice-public-url"
import { resolveInvoiceFromEmail } from "@/lib/invoices/invoice-from-email"
import {
  sendInvoiceCustomerRefundEmail,
  sendInvoiceRefundedNotificationEmail,
} from "@/lib/invoice-email-service"

/**
 * Email merchant (Reply-To) and customer after a Stripe invoice payment refund.
 * Merchant respects notifyOnInvoicePaid; customer is always notified when email is present.
 */
export async function notifyInvoiceStripeRefunded(
  admin: SupabaseClient,
  input: {
    businessId: string
    invoice: Invoice
  },
): Promise<void> {
  const { data: biz } = await admin
    .from("businesses")
    .select("invoice_settings, easetag, name")
    .eq("id", input.businessId)
    .maybeSingle()

  const settings = parseBusinessInvoiceSettings(biz?.invoice_settings)
  const issuer = await fetchInvoiceIssuerForBusiness(admin, input.businessId)
  const businessName = issuer.name?.trim() || biz?.name?.trim() || "Your business"
  const ownerUserId = await resolveOrgOwnerUserId(admin, input.businessId, "")
  let replyEmail =
    (await resolveInvoiceReplyEmail(admin, input.businessId, ownerUserId))?.trim() || null
  if (!replyEmail) {
    replyEmail = resolveInvoiceFromEmail().email
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://business.easner.com").replace(
    /\/$/,
    "",
  )
  const manageInvoiceUrl = `${baseUrl}/invoices/${input.invoice.id}`

  if (settings.notifyOnInvoicePaid !== false && replyEmail) {
    let recipientFirstName: string | undefined
    if (ownerUserId) {
      const { data: owner } = await admin
        .from("users")
        .select("first_name")
        .eq("id", ownerUserId)
        .maybeSingle()
      recipientFirstName = owner?.first_name?.trim() || undefined
    }

    void sendInvoiceRefundedNotificationEmail({
      to: replyEmail,
      businessName,
      invoice: input.invoice,
      manageInvoiceUrl,
      recipientFirstName,
    }).catch((e) => console.error("[stripe] refund merchant email:", e))
  }

  if (input.invoice.customerEmail?.trim() && replyEmail) {
    const easetag =
      typeof biz?.easetag === "string" && biz.easetag.trim() ? biz.easetag.trim() : null
    const invoiceViewUrl = buildInvoiceCustomerViewUrl(baseUrl, easetag, input.invoice)

    void sendInvoiceCustomerRefundEmail({
      invoice: input.invoice,
      businessName,
      businessReplyEmail: replyEmail,
      invoiceViewUrl,
      issuer: { ...issuer, email: replyEmail },
    }).catch((e) => console.error("[stripe] refund customer email:", e))
  }
}

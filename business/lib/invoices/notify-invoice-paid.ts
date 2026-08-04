import type { SupabaseClient } from "@supabase/supabase-js"
import type { Invoice } from "@/lib/b2b/types"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  fetchInvoiceIssuerForBusiness,
  resolveInvoiceReplyEmail,
} from "@/lib/invoices/issuer"
import { parseBusinessInvoiceSettings } from "@/lib/invoices/invoice-settings"
import { sendInvoicePaidNotificationEmail } from "@/lib/invoice-email-service"

function paymentMethodLabel(invoice: Invoice): string {
  const method = invoice.paymentInfo?.method
  if (method === "stripe") return "Online"
  if (method === "easner") return "Easner balance / transfer"
  if (method === "cash") return "Marked paid"
  return "Marked paid"
}

/** Email business Reply-To when an invoice becomes paid (online or manual). */
export async function notifyMerchantInvoicePaid(
  admin: SupabaseClient,
  input: {
    businessId: string
    invoice: Invoice
    invoiceSettingsRaw?: unknown
  },
): Promise<void> {
  const settings = parseBusinessInvoiceSettings(input.invoiceSettingsRaw)
  if (settings.notifyOnInvoicePaid === false) return

  const issuer = await fetchInvoiceIssuerForBusiness(admin, input.businessId)
  const ownerUserId = await resolveOrgOwnerUserId(admin, input.businessId, "")
  const replyEmail = await resolveInvoiceReplyEmail(admin, input.businessId, ownerUserId)
  if (!replyEmail?.trim()) return

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://business.easner.com"
  const manageInvoiceUrl = `${baseUrl.replace(/\/$/, "")}/invoices/${input.invoice.id}`

  let recipientFirstName: string | undefined
  if (ownerUserId) {
    const { data: owner } = await admin
      .from("users")
      .select("first_name")
      .eq("id", ownerUserId)
      .maybeSingle()
    recipientFirstName = owner?.first_name?.trim() || undefined
  }

  await sendInvoicePaidNotificationEmail({
    to: replyEmail.trim(),
    businessName: issuer.name?.trim() || "Your business",
    invoice: input.invoice,
    manageInvoiceUrl,
    recipientFirstName,
    paymentMethodLabel: paymentMethodLabel(input.invoice),
  })
}

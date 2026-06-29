import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import {
  fetchInvoiceIssuerForBusiness,
  resolveInvoiceReplyEmail,
} from "@/lib/invoices/issuer"
import { sendInvoiceViewNotificationEmail } from "@/lib/invoice-email-service"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type InvoiceSettings = {
  notifyOnInvoiceView?: boolean
}

function notifyEnabled(settings: InvoiceSettings | null | undefined): boolean {
  if (!settings || settings.notifyOnInvoiceView === undefined) return true
  return settings.notifyOnInvoiceView !== false
}

/** Email business when a customer views an invoice for the first time. */
export async function notifyMerchantInvoiceViewed(invoiceId: string): Promise<void> {
  const admin = createSupabaseAdmin()
  const { data: row, error } = await admin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle()

  if (error || !row) return

  const b2b = row as B2bInvoiceRow
  const invoice = mapRowToInvoice(b2b)

  const { data: biz } = await admin
    .from("businesses")
    .select("name, invoice_settings")
    .eq("id", b2b.business_id)
    .maybeSingle()

  const settings = (biz?.invoice_settings ?? {}) as InvoiceSettings
  if (!notifyEnabled(settings)) return

  const issuer = await fetchInvoiceIssuerForBusiness(admin, b2b.business_id)
  const replyEmail = await resolveInvoiceReplyEmail(admin, b2b.business_id, "")
  if (!replyEmail) return

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://business.easner.com"
  const manageInvoiceUrl = `${baseUrl.replace(/\/$/, "")}/invoices/${invoice.id}`

  await sendInvoiceViewNotificationEmail({
    to: replyEmail.trim(),
    businessName: issuer.name?.trim() || (biz?.name as string | null)?.trim() || "Your business",
    invoice,
    manageInvoiceUrl,
  })
}

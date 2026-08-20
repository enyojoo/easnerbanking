import type { SupabaseClient } from "@supabase/supabase-js"
import type { Invoice } from "@/lib/b2b/types"
import { generateReceiptPdfBuffer } from "@/lib/generate-receipt-pdf"
import { sendInvoiceReceiptEmail } from "@/lib/invoice-email-service"
import { resolveInvoiceFromEmail } from "@/lib/invoices/invoice-from-email"
import { buildInvoiceCustomerUrl } from "@/lib/invoice-public-url"
import { fetchInvoiceIssuerForBusiness, resolveInvoiceReplyEmail } from "@/lib/invoices/issuer"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"

export type DeliverInvoiceReceiptResult =
  | { ok: true; to: string }
  | { ok: false; error: string }

/**
 * Generate receipt PDF and email it to the invoice customer.
 * Used on Stripe/manual paid and for merchant “Email receipt”.
 */
export async function deliverInvoiceReceiptEmail(
  admin: SupabaseClient,
  input: {
    businessId: string
    invoice: Invoice
    /** Prefer the acting user when resolving Reply-To. */
    actorUserId?: string | null
    easetag?: string | null
  },
): Promise<DeliverInvoiceReceiptResult> {
  const to = input.invoice.customerEmail?.trim()
  if (!to) {
    return { ok: false, error: "Invoice has no customer email" }
  }

  const actor =
    input.actorUserId?.trim() ||
    (await resolveOrgOwnerUserId(admin, input.businessId, "")) ||
    ""

  let reply =
    (await resolveInvoiceReplyEmail(admin, input.businessId, actor))?.trim() || null

  // Never skip the customer receipt solely because Reply-To is unset –
  // fall back to the platform From address so paid invoices still notify.
  if (!reply) {
    reply = resolveInvoiceFromEmail().email
  }

  const issuer = await fetchInvoiceIssuerForBusiness(admin, input.businessId)
  const pdf = await generateReceiptPdfBuffer(input.invoice)

  let easetag = input.easetag?.trim() || null
  if (!easetag) {
    const { data: biz } = await admin
      .from("businesses")
      .select("easetag")
      .eq("id", input.businessId)
      .maybeSingle()
    easetag =
      typeof biz?.easetag === "string" && biz.easetag.trim() ? biz.easetag.trim() : null
  }

  const viewUrl = buildInvoiceCustomerUrl(easetag, input.invoice)

  const result = await sendInvoiceReceiptEmail({
    invoice: input.invoice,
    pdfBuffer: pdf,
    businessName: issuer.name,
    businessReplyEmail: reply,
    invoiceViewUrl: viewUrl,
    issuer: { ...issuer, email: reply },
  })

  if (!result.success) {
    return { ok: false, error: result.error || "Failed to send receipt email" }
  }
  return { ok: true, to }
}

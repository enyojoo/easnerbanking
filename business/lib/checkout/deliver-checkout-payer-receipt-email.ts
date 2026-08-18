import type { SupabaseClient } from "@supabase/supabase-js"
import { sendCheckoutPayerReceiptEmail } from "@/lib/checkout/send-checkout-payer-receipt-email"
import { resolveInvoiceFromEmail } from "@/lib/invoices/invoice-from-email"
import { fetchInvoiceIssuerForBusiness, resolveInvoiceReplyEmail } from "@/lib/invoices/issuer"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { resolveReceiptDisplayTimeZone } from "@/lib/checkout/resolve-receipt-display-timezone"
import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"

export type DeliverCheckoutPayerReceiptResult =
  | { ok: true; to: string }
  | { ok: false; error: string }

export async function deliverCheckoutPayerReceiptEmail(
  admin: SupabaseClient,
  input: {
    businessId: string
    to: string
    customerName?: string | null
    amountCents: number
    currency: string
    description: string
    paidAt: string
    paymentMethod?: StripePaymentMethodDisplay | null
  },
): Promise<DeliverCheckoutPayerReceiptResult> {
  const to = input.to.trim()
  if (!to) {
    return { ok: false, error: "Payer email is required" }
  }

  const actor = (await resolveOrgOwnerUserId(admin, input.businessId, "")) || ""
  let reply = (await resolveInvoiceReplyEmail(admin, input.businessId, actor))?.trim() || null
  if (!reply) {
    reply = resolveInvoiceFromEmail().email
  }

  const issuer = await fetchInvoiceIssuerForBusiness(admin, input.businessId)
  const businessName = issuer.name?.trim() || "Business"
  const timeZone = await resolveReceiptDisplayTimeZone()

  const result = await sendCheckoutPayerReceiptEmail(to, {
    customerName: input.customerName,
    businessName,
    businessReplyEmail: reply,
    amountCents: input.amountCents,
    currency: input.currency,
    description: input.description,
    paidAt: input.paidAt,
    timeZone,
    paymentMethod: input.paymentMethod,
  })

  if (!result.success) {
    return { ok: false, error: result.error || "Failed to send receipt email" }
  }
  return { ok: true, to }
}

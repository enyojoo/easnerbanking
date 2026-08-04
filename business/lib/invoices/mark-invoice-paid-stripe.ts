import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mapRowToInvoice,
  invoiceToDbPayload,
  type B2bInvoiceRow,
} from "@/lib/b2b/map-invoice"
import type { Invoice, InvoicePaymentInfo } from "@/lib/b2b/types"
import { parseInvoiceMetadata } from "@/lib/b2b/invoice-metadata"
import { writeInvoiceAuditLog } from "@/lib/invoices/invoice-audit-log"
import { dispatchInvoiceWebhooks } from "@/lib/invoices/invoice-webhooks"
import { parseBusinessInvoiceSettings } from "@/lib/invoices/invoice-settings"
import { sendInvoiceReceiptEmail } from "@/lib/invoice-email-service"
import { generateReceiptPdfBuffer } from "@/lib/generate-receipt-pdf"
import { fetchInvoiceIssuerForBusiness, resolveInvoiceReplyEmail } from "@/lib/invoices/issuer"
import { invoicePublicViewPath } from "@/lib/invoice-public-url"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"

export type StripePaymentInfoInput = {
  paidAt: string
  paymentIntentId: string
  chargeId?: string
  paymentMethodType?: string
  grossCents: number
  feeCents: number
  netCents: number
  settlementPhase: "payment_received" | "payout_sent" | "credited" | "failed"
  settlementRail?: "grid_va" | "turnkey_stablecoin"
}

/**
 * Mark an invoice paid via Stripe (idempotent if already paid with same PI).
 * Side effects: audit log, merchant webhook, optional receipt email.
 */
export async function markInvoicePaidStripe(
  admin: SupabaseClient,
  input: {
    invoiceId: string
    businessId: string
    paymentInfo: StripePaymentInfoInput
    actorUserId?: string | null
  },
): Promise<{ invoice: Invoice; alreadyPaid: boolean }> {
  const { data: existing, error: fetchErr } = await admin
    .from("invoices")
    .select("*")
    .eq("id", input.invoiceId)
    .eq("business_id", input.businessId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!existing) throw new Error(`Invoice not found: ${input.invoiceId}`)

  const existingRow = existing as B2bInvoiceRow
  const existingInvoice = mapRowToInvoice(existingRow)
  const meta = parseInvoiceMetadata(existingRow.metadata)
  const priorPayment = meta.paymentInfo

  if (
    existingInvoice.status === "paid" &&
    priorPayment?.method === "stripe" &&
    priorPayment.stripe?.paymentIntentId === input.paymentInfo.paymentIntentId
  ) {
    return { invoice: existingInvoice, alreadyPaid: true }
  }

  // If already paid via cash/easner, continue and overwrite with Stripe payment info below.

  const paymentInfo: InvoicePaymentInfo = {
    paidAt: input.paymentInfo.paidAt,
    method: "stripe",
    stripe: {
      paymentIntentId: input.paymentInfo.paymentIntentId,
      chargeId: input.paymentInfo.chargeId,
      paymentMethodType: input.paymentInfo.paymentMethodType ?? "card",
      grossCents: input.paymentInfo.grossCents,
      feeCents: input.paymentInfo.feeCents,
      netCents: input.paymentInfo.netCents,
      settlementPhase: input.paymentInfo.settlementPhase,
      settlementRail: input.paymentInfo.settlementRail,
    },
  }

  const statusHistory = [
    ...(existingInvoice.statusHistory ?? []),
    { status: "paid", timestamp: input.paymentInfo.paidAt },
  ]

  const updatedInvoice: Invoice = {
    ...existingInvoice,
    status: "paid",
    paymentInfo,
    statusHistory,
  }

  const payload = invoiceToDbPayload({
    businessId: input.businessId,
    customerId: existingRow.customer_id,
    invoice: updatedInvoice,
    invoiceNumber: existingRow.invoice_number,
  })

  const { data, error } = await admin
    .from("invoices")
    .update(payload)
    .eq("id", input.invoiceId)
    .eq("business_id", input.businessId)
    .select("*")
    .single()

  if (error) throw error

  const mapped = mapRowToInvoice(data as B2bInvoiceRow)

  const actorUserId =
    input.actorUserId?.trim() ||
    (await resolveOrgOwnerUserId(admin, input.businessId, ""))

  void writeInvoiceAuditLog({
    invoiceId: input.invoiceId,
    businessId: input.businessId,
    actorUserId: actorUserId || null,
    action: "status_changed",
    changes: {
      before: { status: existingInvoice.status },
      after: { status: "paid", method: "stripe" },
      stripePaymentIntentId: input.paymentInfo.paymentIntentId,
    },
  })

  if (existingInvoice.status !== "paid") {
    void dispatchInvoiceWebhooks({
      businessId: input.businessId,
      event: "invoice.paid",
      payload: {
        invoiceId: input.invoiceId,
        invoiceNumber: mapped.invoiceNumber,
        status: "paid",
      },
    })
  }

  if (existingInvoice.status !== "paid") {
    const { data: biz } = await admin
      .from("businesses")
      .select("invoice_settings, easetag, name")
      .eq("id", input.businessId)
      .maybeSingle()
    const settings = parseBusinessInvoiceSettings(biz?.invoice_settings)
    if (settings.sendReceiptOnPaid !== false && mapped.customerEmail?.trim()) {
      void (async () => {
        try {
          const ownerId = await resolveOrgOwnerUserId(admin, input.businessId, "")
          const reply = await resolveInvoiceReplyEmail(admin, input.businessId, ownerId)
          if (!reply) return
          const pdf = await generateReceiptPdfBuffer(mapped)
          const issuer = await fetchInvoiceIssuerForBusiness(admin, input.businessId)
          const easetag =
            typeof biz?.easetag === "string" && biz.easetag.trim() ? biz.easetag.trim() : null
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://business.easner.com"
          const viewUrl = easetag
            ? `${baseUrl}${invoicePublicViewPath(easetag, mapped.invoiceNumber)}`
            : `${baseUrl}/invoice-view/${mapped.id}`
          await sendInvoiceReceiptEmail({
            invoice: mapped,
            pdfBuffer: pdf,
            businessName: issuer.name,
            businessReplyEmail: reply,
            invoiceViewUrl: viewUrl,
            issuer: { ...issuer, email: reply },
          })
        } catch (e) {
          console.error("[stripe] paid receipt email:", e)
        }
      })()
    }
  }

  return { invoice: mapped, alreadyPaid: false }
}

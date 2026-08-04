import { sendInvoiceEmail } from "@/lib/invoice-email-service"
import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { fetchInvoiceIssuerForBusiness, resolveInvoiceReplyEmail } from "@/lib/invoices/issuer"
import { resolvePayInForBusiness } from "@/lib/invoices/resolve-pay-in-for-business"
import { parseBusinessInvoiceSettings } from "@/lib/invoices/invoice-settings"
import { resolvePaymentDisplay } from "@/lib/invoices/resolve-payment-display"
import { filterPayInByDisplay } from "@/lib/invoices/filter-pay-in-by-display"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { generateInvoicePdfBuffer } from "@/lib/generate-invoice-pdf"
import { invoicePublicViewPath } from "@/lib/invoice-public-url"
import {
  canProvisionInvoiceDepositInstructions,
  TIER2_COMPLETE_PLACEHOLDER,
} from "@/lib/compliance-placeholders"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { Invoice } from "@/lib/b2b/types"

type ReminderType = "due_today" | "overdue_7d"

function reminderAlreadySent(invoice: Invoice, type: ReminderType): boolean {
  return (invoice.remindersSent ?? []).some((r) => r.type === type)
}

function appendReminder(invoice: Invoice, type: ReminderType): Invoice["remindersSent"] {
  return [...(invoice.remindersSent ?? []), { type, sentAt: new Date().toISOString() }]
}

export async function sendInvoiceReminder(row: B2bInvoiceRow, type: ReminderType): Promise<boolean> {
  const admin = createSupabaseAdmin()
  const invoice = mapRowToInvoice(row)
  if (!invoice.customerEmail?.trim()) return false
  if (reminderAlreadySent(invoice, type)) return false

  const businessId = row.business_id
  const { data: biz } = await admin
    .from("businesses")
    .select("verification_status, noah_kyb_status, invoice_settings, easetag")
    .eq("id", businessId)
    .maybeSingle()

  const tier1Complete = isBusinessTier1Complete(biz)
  const canProvision = canProvisionInvoiceDepositInstructions(
    invoice.currency,
    tier1Complete,
    TIER2_COMPLETE_PLACEHOLDER,
  )

  const rawPayIn = canProvision
    ? await resolvePayInForBusiness(businessId, invoice.currency, { persistVirtualAccount: false })
    : {}

  const settings = parseBusinessInvoiceSettings(biz?.invoice_settings)
  const display = resolvePaymentDisplay({
    invoice,
    businessDefaults: settings,
    payIn: rawPayIn,
    payable: true,
    stripeOnlineEnabled: isStripeInvoicePaymentsEnabled(),
  })
  const payIn = display.includePaymentInEmail ? filterPayInByDisplay(rawPayIn, display) : {}

  const issuer = await fetchInvoiceIssuerForBusiness(admin, businessId)
  const replyEmail = await resolveInvoiceReplyEmail(admin, businessId, "")
  if (!replyEmail) return false

  const easetag =
    typeof biz?.easetag === "string" && biz.easetag.trim() ? biz.easetag.trim() : null
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://business.easner.com"
  const invoiceViewUrl = easetag
    ? `${baseUrl}${invoicePublicViewPath(easetag, invoice.invoiceNumber)}`
    : `${baseUrl}/invoice-view/${invoice.id}`

  const pdfBuffer = await generateInvoicePdfBuffer(
    invoice,
    display.includePaymentOnPdf ? payIn.bankAccount : undefined,
    display.includePaymentOnPdf ? payIn.stablecoinAccount : undefined,
    { ...issuer, email: replyEmail },
  )

  const result = await sendInvoiceEmail(invoice, invoiceViewUrl, pdfBuffer, {
    businessName: issuer.name,
    businessReplyEmail: replyEmail,
    issuer: { ...issuer, email: replyEmail },
  })

  if (!result.success) return false

  const remindersSent = appendReminder(invoice, type)
  await admin
    .from("invoices")
    .update({
      metadata: {
        ...(typeof row.metadata === "object" && row.metadata ? row.metadata : {}),
        remindersSent,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)

  return true
}

export function invoicesDueForReminder(
  rows: B2bInvoiceRow[],
  today: string,
): { row: B2bInvoiceRow; type: ReminderType }[] {
  const out: { row: B2bInvoiceRow; type: ReminderType }[] = []
  const overdueCutoff = new Date(today)
  overdueCutoff.setDate(overdueCutoff.getDate() - 7)
  const overdueStr = overdueCutoff.toISOString().slice(0, 10)

  for (const row of rows) {
    const inv = mapRowToInvoice(row)
    if (!["open", "sent", "past_due"].includes(inv.status)) continue
    const due = inv.dueDate?.slice(0, 10)
    if (!due) continue

    if (due === today && !reminderAlreadySent(inv, "due_today")) {
      out.push({ row, type: "due_today" })
    } else if (due <= overdueStr && !reminderAlreadySent(inv, "overdue_7d")) {
      out.push({ row, type: "overdue_7d" })
    }
  }
  return out
}

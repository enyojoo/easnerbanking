import {
  customerGreetingParagraphHtml,
  easnerUserGreetingParagraphHtml,
  formatCustomerGreetingPlain,
  formatEasnerUserGreetingPlain,
  generateBaseEmailTemplate,
  generateTransactionDetailsTable,
  EASNER_COMPANY_ADDRESS,
  EASNER_COMPANY_LEGAL_NAME,
  resolveEmailReplyTo,
  type TransactionDetailRow,
} from "@easner/server"
import { formatTransactionWhen } from "@easner/shared"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { Invoice } from "@/lib/b2b/types"
import type { InvoicePdfIssuer } from "@/lib/invoices/issuer"
import { invoiceCustomerContactLine } from "@/lib/invoices/invoice-reply-email"
import { resolveInvoiceEmailPaymentMethod } from "@/lib/invoices/invoice-email-payment-method"
import {
  emailPaymentContextParagraph,
  emailPrimaryCtaText,
  type PaymentMethodsFlags,
} from "@/lib/invoices/invoice-payment-copy"

const INVOICE_EMAIL_OPTIONS = {
  audience: "business" as const,
  showPreferencesLink: false,
  hideHeaderTitle: true,
  minimalFooter: true,
} as const

function invoiceAmountLine(invoice: Invoice): string {
  const amount = formatCurrency(invoice.total, invoice.currency)
  return `${invoice.invoiceNumber} - ${amount} ${invoice.currency}`
}

function invoiceSummaryRows(invoice: Invoice): TransactionDetailRow[] {
  const amount = formatCurrency(invoice.total, invoice.currency)
  return [
    { label: "Invoice number", value: invoice.invoiceNumber },
    { label: "Amount", value: `${amount} ${invoice.currency}` },
  ]
}

/** Paid-invoice detail rows aligned with transaction email layout (Payment method, When, Status). */
function invoicePaidDetailRows(invoice: Invoice): TransactionDetailRow[] {
  const rows: TransactionDetailRow[] = [...invoiceSummaryRows(invoice)]
  const paymentMethod = resolveInvoiceEmailPaymentMethod(invoice)
  if (paymentMethod) {
    rows.push({
      label: "Payment method",
      value: paymentMethod.htmlText,
      brandIconSrc: paymentMethod.brandIconSrc,
    })
  }
  const paidAt = invoice.paymentInfo?.paidAt
  if (paidAt) {
    const when = formatTransactionWhen(paidAt)
    if (when) rows.push({ label: "When", value: when })
  }
  rows.push({ label: "Status", value: "Paid", isStatus: true, statusClass: "completed" })
  return rows
}

function invoicePaidDetailPlainLines(invoice: Invoice): string[] {
  const lines: string[] = [`Invoice: ${invoiceAmountLine(invoice)}`]
  const paymentMethod = resolveInvoiceEmailPaymentMethod(invoice)
  if (paymentMethod) lines.push(`Payment method: ${paymentMethod.plainText}`)
  const paidAt = invoice.paymentInfo?.paidAt
  if (paidAt) {
    const when = formatTransactionWhen(paidAt)
    if (when) lines.push(`When: ${when}`)
  }
  lines.push("Status: Paid")
  return lines
}

function invoiceDetailsTable(rows: TransactionDetailRow[]): string {
  return generateTransactionDetailsTable(rows)
}

function invoiceContactFooter(data: {
  businessName: string
  businessReplyEmail?: string
}): { html: string; text: string } {
  const merchantEmail = data.businessReplyEmail?.trim()
  if (!merchantEmail) {
    const support = resolveEmailReplyTo()
    return {
      html: `If you have any questions or think an error was made, email <a href="mailto:${support}" style="color: #007ACC; text-decoration: none; word-break: break-all;">${support}</a>.`,
      text: `If you have any questions or think an error was made, email ${support}.`,
    }
  }
  const line = invoiceCustomerContactLine(merchantEmail)
  return {
    html: `If you have any questions about this invoice, email <a href="mailto:${merchantEmail}" style="color: #007ACC; text-decoration: none; word-break: break-all;">${merchantEmail}</a>.`,
    text: line,
  }
}

function invoiceCustomerFooterDisclaimerHtml(
  businessName: string,
  businessReplyEmail?: string,
): string {
  const contact = invoiceContactFooter({ businessName, businessReplyEmail })
  return `
    <p class="footer-text">You're receiving this email because ${businessName} uses Easner Business Banking services to manage their business processes.</p>
    <p class="footer-text">${contact.html}</p>
  `.trim()
}

function invoiceCustomerFooterDisclaimerText(
  businessName: string,
  businessReplyEmail?: string,
): string {
  const contact = invoiceContactFooter({ businessName, businessReplyEmail })
  return `You're receiving this email because ${businessName} uses Easner Business Banking services to manage their business processes.

${contact.text}`
}

function invoiceCustomerEmailShellOptions(
  businessName: string,
  businessReplyEmail?: string,
  preheader?: string,
) {
  return {
    ...INVOICE_EMAIL_OPTIONS,
    preheader,
    footerDisclaimerHtml: invoiceCustomerFooterDisclaimerHtml(businessName, businessReplyEmail),
  }
}

function invoiceCustomerTextFooter(businessName: string, businessReplyEmail?: string): string {
  const year = new Date().getFullYear()
  return `${invoiceCustomerFooterDisclaimerText(businessName, businessReplyEmail)}

© ${year} ${EASNER_COMPANY_LEGAL_NAME} All rights reserved.
${EASNER_COMPANY_ADDRESS}`
}

export interface InvoiceViewedNotificationEmailData {
  invoice: Invoice
  businessName: string
  manageInvoiceUrl: string
  /** Easner business owner / merchant first name for greeting. */
  recipientFirstName?: string
}

export interface InvoiceReceiptEmailData {
  invoice: Invoice
  invoiceViewUrl: string
  businessName: string
  businessReplyEmail: string
  issuer: InvoicePdfIssuer
}

export function getInvoiceViewedNotificationSubject(invoiceNumber: string): string {
  return `Customer viewed invoice ${invoiceNumber}`
}

export function generateInvoiceViewedNotificationHtml(
  data: InvoiceViewedNotificationEmailData,
): string {
  const { invoice, businessName, manageInvoiceUrl } = data
  const customer = invoice.customerName?.trim() || "A customer"
  const subject = getInvoiceViewedNotificationSubject(invoice.invoiceNumber)

  const content = `
    ${easnerUserGreetingParagraphHtml(data.recipientFirstName)}
    <p class="confirmation-text">${customer} viewed invoice <strong>${invoice.invoiceNumber}</strong>.</p>
    ${invoiceDetailsTable([
      ...invoiceSummaryRows(invoice),
      { label: "Customer", value: customer },
    ])}
    <p class="confirmation-text">
      You're receiving this because invoice view notifications are enabled in Easner Business.
      Manage this in Settings → Invoicing.
    </p>
  `.trim()

  return generateBaseEmailTemplate(
    subject,
    "",
    content,
    { text: "View invoice", url: manageInvoiceUrl },
    {
      audience: "business",
      showPreferencesLink: false,
      hideHeaderTitle: true,
      preheader: `${customer} viewed invoice ${invoice.invoiceNumber}`,
    },
  )
}

export function generateInvoiceViewedNotificationText(
  data: InvoiceViewedNotificationEmailData,
): string {
  const { invoice, businessName, manageInvoiceUrl } = data
  const customer = invoice.customerName?.trim() || "A customer"

  return `
${formatEasnerUserGreetingPlain(data.recipientFirstName)}

${customer} viewed invoice ${invoice.invoiceNumber}.

Invoice: ${invoiceAmountLine(invoice)}
Customer: ${customer}

View invoice: ${manageInvoiceUrl}

---

You're receiving this because invoice view notifications are enabled in Easner Business.
Manage this in Settings → Invoicing.
  `.trim()
}

export interface InvoicePaidNotificationEmailData {
  invoice: Invoice
  businessName: string
  manageInvoiceUrl: string
  recipientFirstName?: string
  /** How the invoice was paid, e.g. "Online", "Marked paid". */
  paymentMethodLabel?: string
}

export function getInvoicePaidNotificationSubject(invoiceNumber: string): string {
  return `Invoice ${invoiceNumber} was paid`
}

export function generateInvoicePaidNotificationHtml(
  data: InvoicePaidNotificationEmailData,
): string {
  const { invoice, manageInvoiceUrl } = data
  const customer = invoice.customerName?.trim() || "A customer"
  const subject = getInvoicePaidNotificationSubject(invoice.invoiceNumber)
  const method = data.paymentMethodLabel?.trim()

  const content = `
    ${easnerUserGreetingParagraphHtml(data.recipientFirstName)}
    <p class="confirmation-text">${customer} paid invoice <strong>${invoice.invoiceNumber}</strong>.</p>
    ${invoiceDetailsTable([
      ...invoiceSummaryRows(invoice),
      { label: "Customer", value: customer },
      ...(method ? [{ label: "Payment", value: method }] : []),
    ])}
    <p class="confirmation-text">
      You're receiving this because invoice payment notifications are enabled in Easner Business.
      Manage this in Settings → Invoicing.
    </p>
  `.trim()

  return generateBaseEmailTemplate(
    subject,
    "",
    content,
    { text: "View invoice", url: manageInvoiceUrl },
    {
      audience: "business",
      showPreferencesLink: false,
      hideHeaderTitle: true,
      preheader: `${customer} paid invoice ${invoice.invoiceNumber}`,
    },
  )
}

export function generateInvoicePaidNotificationText(
  data: InvoicePaidNotificationEmailData,
): string {
  const { invoice, manageInvoiceUrl } = data
  const customer = invoice.customerName?.trim() || "A customer"
  const method = data.paymentMethodLabel?.trim()

  return `
${formatEasnerUserGreetingPlain(data.recipientFirstName)}

${customer} paid invoice ${invoice.invoiceNumber}.

Invoice: ${invoiceAmountLine(invoice)}
Customer: ${customer}${method ? `\nPayment: ${method}` : ""}

View invoice: ${manageInvoiceUrl}

---

You're receiving this because invoice payment notifications are enabled in Easner Business.
Manage this in Settings → Invoicing.
  `.trim()
}

export function getInvoiceReceiptEmailSubject(invoiceNumber: string): string {
  return `Payment received for invoice ${invoiceNumber}`
}

export interface InvoiceRefundedNotificationEmailData {
  invoice: Invoice
  businessName: string
  manageInvoiceUrl: string
  recipientFirstName?: string
}

export interface InvoiceCustomerRefundEmailData {
  invoice: Invoice
  invoiceViewUrl: string
  businessName: string
  businessReplyEmail: string
  issuer: InvoicePdfIssuer
}

function invoiceRefundDetailRows(invoice: Invoice): TransactionDetailRow[] {
  const rows: TransactionDetailRow[] = [...invoiceSummaryRows(invoice)]
  // Invoice status is no longer paid after refund - resolve PM from paymentInfo directly.
  const stripe = invoice.paymentInfo?.method === "stripe" ? invoice.paymentInfo.stripe : undefined
  if (stripe) {
    const pm = resolveInvoiceEmailPaymentMethod({
      ...invoice,
      status: "paid",
      paymentInfo: invoice.paymentInfo,
    })
    if (pm) {
      rows.push({
        label: "Payment method",
        value: pm.htmlText,
        brandIconSrc: pm.brandIconSrc,
      })
    }
  }
  const refundedAt = stripe?.refundedAt || invoice.paymentInfo?.paidAt
  if (refundedAt) {
    const when = formatTransactionWhen(refundedAt)
    if (when) rows.push({ label: "When", value: when })
  }
  rows.push({ label: "Status", value: "Refunded", isStatus: true, statusClass: "failed" })
  return rows
}

function invoiceRefundDetailPlainLines(invoice: Invoice): string[] {
  const lines: string[] = [`Invoice: ${invoiceAmountLine(invoice)}`]
  const stripe = invoice.paymentInfo?.method === "stripe" ? invoice.paymentInfo.stripe : undefined
  if (stripe) {
    const pm = resolveInvoiceEmailPaymentMethod({
      ...invoice,
      status: "paid",
      paymentInfo: invoice.paymentInfo,
    })
    if (pm) lines.push(`Payment method: ${pm.plainText}`)
  }
  const refundedAt = stripe?.refundedAt || invoice.paymentInfo?.paidAt
  if (refundedAt) {
    const when = formatTransactionWhen(refundedAt)
    if (when) lines.push(`When: ${when}`)
  }
  lines.push("Status: Refunded")
  return lines
}

export function getInvoiceRefundedNotificationSubject(invoiceNumber: string): string {
  return `Invoice ${invoiceNumber} payment was refunded`
}

export function generateInvoiceRefundedNotificationHtml(
  data: InvoiceRefundedNotificationEmailData,
): string {
  const { invoice, manageInvoiceUrl } = data
  const customer = invoice.customerName?.trim() || "A customer"
  const subject = getInvoiceRefundedNotificationSubject(invoice.invoiceNumber)

  const content = `
    ${easnerUserGreetingParagraphHtml(data.recipientFirstName)}
    <p class="confirmation-text">The online payment for invoice <strong>${invoice.invoiceNumber}</strong> was refunded. The invoice is open again for payment.</p>
    ${invoiceDetailsTable([
      ...invoiceSummaryRows(invoice),
      { label: "Customer", value: customer },
      { label: "Status", value: "Refunded", isStatus: true, statusClass: "failed" },
    ])}
    <p class="confirmation-text">
      You're receiving this because invoice payment notifications are enabled in Easner Business.
      Manage this in Settings → Invoicing.
    </p>
  `.trim()

  return generateBaseEmailTemplate(
    subject,
    "",
    content,
    { text: "View invoice", url: manageInvoiceUrl },
    {
      audience: "business",
      showPreferencesLink: false,
      hideHeaderTitle: true,
      preheader: `Payment refunded for invoice ${invoice.invoiceNumber}`,
    },
  )
}

export function generateInvoiceRefundedNotificationText(
  data: InvoiceRefundedNotificationEmailData,
): string {
  const { invoice, manageInvoiceUrl } = data
  const customer = invoice.customerName?.trim() || "A customer"

  return `
${formatEasnerUserGreetingPlain(data.recipientFirstName)}

The online payment for invoice ${invoice.invoiceNumber} was refunded. The invoice is open again for payment.

Invoice: ${invoiceAmountLine(invoice)}
Customer: ${customer}
Status: Refunded

View invoice: ${manageInvoiceUrl}

---

You're receiving this because invoice payment notifications are enabled in Easner Business.
Manage this in Settings → Invoicing.
  `.trim()
}

export function getInvoiceCustomerRefundEmailSubject(invoiceNumber: string): string {
  return `Payment refunded for invoice ${invoiceNumber}`
}

export function generateInvoiceCustomerRefundEmailHtml(
  data: InvoiceCustomerRefundEmailData,
): string {
  const { invoice, invoiceViewUrl, businessName, businessReplyEmail } = data
  const subject = getInvoiceCustomerRefundEmailSubject(invoice.invoiceNumber)

  const content = `
    ${customerGreetingParagraphHtml(invoice.customerName)}
    <p class="confirmation-text">Your payment for this invoice from ${businessName} has been refunded. The invoice is open again if you still need to pay.</p>
    ${invoiceDetailsTable(invoiceRefundDetailRows(invoice))}
  `.trim()

  return generateBaseEmailTemplate(
    subject,
    "",
    content,
    { text: "View invoice", url: invoiceViewUrl },
    invoiceCustomerEmailShellOptions(
      businessName,
      businessReplyEmail,
      `Payment refunded for invoice ${invoice.invoiceNumber}`,
    ),
  )
}

export function generateInvoiceCustomerRefundEmailText(
  data: InvoiceCustomerRefundEmailData,
): string {
  const { invoice, invoiceViewUrl, businessName, businessReplyEmail } = data

  return `
${formatCustomerGreetingPlain(invoice.customerName)}

Your payment for this invoice from ${businessName} has been refunded. The invoice is open again if you still need to pay.

${invoiceRefundDetailPlainLines(invoice).join("\n")}

View invoice: ${invoiceViewUrl}

---

${invoiceCustomerTextFooter(businessName, businessReplyEmail)}
  `.trim()
}

export function generateInvoiceReceiptEmailHtml(data: InvoiceReceiptEmailData): string {
  const { invoice, invoiceViewUrl, businessName, businessReplyEmail } = data
  const subject = getInvoiceReceiptEmailSubject(invoice.invoiceNumber)

  const content = `
    ${customerGreetingParagraphHtml(invoice.customerName)}
    <p class="confirmation-text">Thank you - we received your payment for this invoice from ${businessName}.</p>
    ${invoiceDetailsTable(invoicePaidDetailRows(invoice))}
  `.trim()

  return generateBaseEmailTemplate(
    subject,
    "",
    content,
    { text: "View invoice", url: invoiceViewUrl },
    invoiceCustomerEmailShellOptions(
      businessName,
      businessReplyEmail,
      `Payment received for invoice ${invoice.invoiceNumber}`,
    ),
  )
}

export function generateInvoiceReceiptEmailText(data: InvoiceReceiptEmailData): string {
  const { invoice, invoiceViewUrl, businessName, businessReplyEmail } = data

  return `
${formatCustomerGreetingPlain(invoice.customerName)}

Thank you - we received your payment for this invoice from ${businessName}.

${invoicePaidDetailPlainLines(invoice).join("\n")}

View invoice: ${invoiceViewUrl}

---

${invoiceCustomerTextFooter(businessName, businessReplyEmail)}
  `.trim()
}

export type InvoiceReminderEmailType = "due_today" | "overdue_7d"

export interface InvoiceEmailData {
  invoice: Invoice
  invoiceViewUrl: string
  businessName: string
  /** Merchant support email - used for Reply-To and footer contact line. */
  businessReplyEmail?: string
  /** Merchant profile - used for Reply-To resolution upstream; not shown in email body. */
  issuer: InvoicePdfIssuer
  /** When true, add pay-via-link context and use "View & pay invoice" CTA when applicable. */
  includePaymentContext?: boolean
  paymentMethods?: PaymentMethodsFlags
  /** When set, overrides status-based subject/intro for automated reminders. */
  reminderType?: InvoiceReminderEmailType
}

/** Status-specific email copy */
const EMAIL_BY_STATUS: Record<
  string,
  { subject: string; bodyIntro: string; bodyIntroPlain: string }
> = {
  draft: {
    subject: "Invoice from",
    bodyIntro: "has sent you an invoice.",
    bodyIntroPlain: "has sent you an invoice.",
  },
  unpaid: {
    subject: "Invoice from",
    bodyIntro: "has sent you an invoice.",
    bodyIntroPlain: "has sent you an invoice.",
  },
  sent: {
    subject: "Invoice from",
    bodyIntro: "has sent you an invoice.",
    bodyIntroPlain: "has sent you an invoice.",
  },
  past_due: {
    subject: "Reminder: Your invoice from",
    bodyIntro: "This is a reminder that your invoice is past due.",
    bodyIntroPlain: "This is a reminder that your invoice is past due.",
  },
  paid: {
    subject: "Your invoice from",
    bodyIntro: "Your invoice has been marked as paid.",
    bodyIntroPlain: "Your invoice has been marked as paid.",
  },
  void: {
    subject: "Your invoice from",
    bodyIntro: "Your invoice has been voided.",
    bodyIntroPlain: "Your invoice has been voided.",
  },
}

const defaultEmail = EMAIL_BY_STATUS.sent

const REMINDER_EMAIL_COPY: Record<
  InvoiceReminderEmailType,
  { subject: string; bodyIntro: string; bodyIntroPlain: string }
> = {
  due_today: {
    subject: "Reminder: Invoice due today from",
    bodyIntro: "This is a reminder that your invoice is due today.",
    bodyIntroPlain: "This is a reminder that your invoice is due today.",
  },
  overdue_7d: {
    subject: "Reminder: Your invoice from",
    bodyIntro: "This is a reminder that your invoice is past due.",
    bodyIntroPlain: "This is a reminder that your invoice is past due.",
  },
}

function resolveEmailCopy(data: InvoiceEmailData): {
  subject: string
  bodyIntro: string
  bodyIntroPlain: string
} {
  if (data.reminderType) return REMINDER_EMAIL_COPY[data.reminderType]
  return EMAIL_BY_STATUS[data.invoice.status] ?? defaultEmail
}

export function getInvoiceEmailSubject(data: InvoiceEmailData): string {
  const { invoice, businessName } = data
  const config = resolveEmailCopy(data)
  return `${config.subject} ${businessName} - ${invoice.invoiceNumber}`
}

function getBodyIntro(data: InvoiceEmailData): string {
  const { businessName } = data
  const config = resolveEmailCopy(data)
  return config.bodyIntro.includes("has sent")
    ? `${businessName} ${config.bodyIntro}`
    : config.bodyIntro
}

function getBodyIntroPlain(data: InvoiceEmailData): string {
  const { businessName } = data
  const config = resolveEmailCopy(data)
  return config.bodyIntroPlain.includes("has sent")
    ? `${businessName} ${config.bodyIntroPlain}`
    : config.bodyIntroPlain
}

export function generateInvoiceEmailHtml(data: InvoiceEmailData): string {
  const { invoice, invoiceViewUrl, businessName, businessReplyEmail } = data
  const dueDate = formatDate(invoice.dueDate, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const bodyIntro = getBodyIntro(data)
  const emailSubject = getInvoiceEmailSubject(data)
  const paymentFlags = data.paymentMethods ?? {
    hasOnline: false,
    hasBank: false,
    hasStablecoin: false,
  }
  const paymentParagraph =
    data.includePaymentContext === true
      ? emailPaymentContextParagraph(paymentFlags)
      : null
  const ctaText = emailPrimaryCtaText(
    invoice.status,
    paymentFlags,
    data.includePaymentContext === true,
  )

  const detailRows =
    invoice.status === "paid" && invoice.paymentInfo
      ? invoicePaidDetailRows(invoice)
      : [...invoiceSummaryRows(invoice), { label: "Due", value: dueDate }]

  const content = `
    ${customerGreetingParagraphHtml(invoice.customerName)}
    <p class="confirmation-text">${bodyIntro}</p>
    ${paymentParagraph ? `<p class="confirmation-text">${paymentParagraph}</p>` : ""}
    ${invoiceDetailsTable(detailRows)}
  `.trim()

  return generateBaseEmailTemplate(
    emailSubject,
    "",
    content,
    { text: ctaText, url: invoiceViewUrl },
    invoiceCustomerEmailShellOptions(businessName, businessReplyEmail, bodyIntro),
  )
}

export function generateInvoiceEmailText(data: InvoiceEmailData): string {
  const { invoice, invoiceViewUrl, businessName, businessReplyEmail } = data
  const dueDate = formatDate(invoice.dueDate, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const bodyIntro = getBodyIntroPlain(data)
  const paymentFlags = data.paymentMethods ?? {
    hasOnline: false,
    hasBank: false,
    hasStablecoin: false,
  }
  const paymentParagraph =
    data.includePaymentContext === true
      ? emailPaymentContextParagraph(paymentFlags)
      : null
  const ctaText = emailPrimaryCtaText(
    invoice.status,
    paymentFlags,
    data.includePaymentContext === true,
  )

  return `
${formatCustomerGreetingPlain(invoice.customerName)}

${bodyIntro}
${paymentParagraph ? `\n${paymentParagraph}` : ""}

${
    invoice.status === "paid" && invoice.paymentInfo
      ? invoicePaidDetailPlainLines(invoice).join("\n")
      : `Invoice: ${invoiceAmountLine(invoice)}\nDue: ${dueDate}`
  }

${ctaText}: ${invoiceViewUrl}

---

${invoiceCustomerTextFooter(businessName, businessReplyEmail)}
  `.trim()
}

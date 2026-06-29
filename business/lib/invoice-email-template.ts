import {
  generateBaseEmailTemplate,
  generateTransactionDetailsTable,
  EASNER_BUSINESS_LOGO_URL,
  EASNER_COMPANY_ADDRESS,
  EASNER_COMPANY_LEGAL_NAME,
  type TransactionDetailRow,
} from "@easner/server"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { Invoice } from "@/lib/b2b/types"
import type { InvoicePdfIssuer } from "@/lib/invoices/issuer"
import { invoiceCustomerContactLine } from "@/lib/invoices/invoice-reply-email"

const INVOICE_EMAIL_OPTIONS = {
  audience: "business" as const,
  showPreferencesLink: false,
  hideHeaderTitle: true,
  minimalFooter: true,
  logoMarkup: `<img src="${EASNER_BUSINESS_LOGO_URL}" alt="Easner Business" class="logo" width="140">`,
} as const

function invoiceAmountLine(invoice: Invoice): string {
  const amount = formatCurrency(invoice.total, invoice.currency)
  return `${invoice.invoiceNumber} – ${amount} ${invoice.currency}`
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
    const support = process.env.SENDGRID_REPLY_TO?.trim() || "support@easner.com"
    return {
      html: `If you have any questions or think an error was made, please contact Easner at <a href="mailto:${support}" style="color: #007ACC; text-decoration: none;">${support}</a>.`,
      text: `If you have any questions or think an error was made, please contact Easner at ${support}.`,
    }
  }
  const line = invoiceCustomerContactLine(data.businessName, merchantEmail)
  return {
    html: `If you have any questions about this invoice, contact <strong>${data.businessName}</strong> at <a href="mailto:${merchantEmail}" style="color: #007ACC; text-decoration: none;">${merchantEmail}</a>.`,
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
    <p class="welcome-text">Hello ${businessName},</p>
    <p class="confirmation-text">${customer} viewed invoice <strong>${invoice.invoiceNumber}</strong>.</p>
    ${invoiceDetailsTable([
      { label: "Invoice", value: invoiceAmountLine(invoice) },
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
Hello ${businessName},

${customer} viewed invoice ${invoice.invoiceNumber}.

Invoice: ${invoiceAmountLine(invoice)}
Customer: ${customer}

View invoice: ${manageInvoiceUrl}

---

You're receiving this because invoice view notifications are enabled in Easner Business.
Manage this in Settings → Invoicing.
  `.trim()
}

export function getInvoiceReceiptEmailSubject(invoiceNumber: string): string {
  return `Payment received for invoice ${invoiceNumber}`
}

export function generateInvoiceReceiptEmailHtml(data: InvoiceReceiptEmailData): string {
  const { invoice, invoiceViewUrl, businessName, businessReplyEmail } = data
  const subject = getInvoiceReceiptEmailSubject(invoice.invoiceNumber)

  const content = `
    <p class="welcome-text">Dear ${invoice.customerName},</p>
    <p class="confirmation-text">Thank you — we received your payment for this invoice from ${businessName}.</p>
    ${invoiceDetailsTable([
      { label: "Invoice", value: invoiceAmountLine(invoice) },
      { label: "Status", value: "Paid", isStatus: true, statusClass: "completed" },
    ])}
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
Dear ${invoice.customerName},

Thank you — we received your payment for this invoice from ${businessName}.

Invoice: ${invoiceAmountLine(invoice)}
Status: Paid

View invoice: ${invoiceViewUrl}

---

${invoiceCustomerTextFooter(businessName, businessReplyEmail)}
  `.trim()
}

export interface InvoiceEmailData {
  invoice: Invoice
  invoiceViewUrl: string
  businessName: string
  /** Merchant support email — used for Reply-To and footer contact line. */
  businessReplyEmail?: string
  /** Merchant profile — used for Reply-To resolution upstream; not shown in email body. */
  issuer: InvoicePdfIssuer
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
  open: {
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
  failed: {
    subject: "Invoice from",
    bodyIntro: "has sent you an invoice.",
    bodyIntroPlain: "has sent you an invoice.",
  },
}

const defaultEmail = EMAIL_BY_STATUS.sent

export function getInvoiceEmailSubject(data: InvoiceEmailData): string {
  const { invoice, businessName } = data
  const config = EMAIL_BY_STATUS[invoice.status] ?? defaultEmail
  return `${config.subject} ${businessName} – ${invoice.invoiceNumber}`
}

function getBodyIntro(data: InvoiceEmailData): string {
  const { invoice, businessName } = data
  const config = EMAIL_BY_STATUS[invoice.status] ?? defaultEmail
  return config.bodyIntro.includes("has sent")
    ? `${businessName} ${config.bodyIntro}`
    : config.bodyIntro
}

function getBodyIntroPlain(data: InvoiceEmailData): string {
  const { invoice, businessName } = data
  const config = EMAIL_BY_STATUS[invoice.status] ?? defaultEmail
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

  const content = `
    <p class="welcome-text">Dear ${invoice.customerName},</p>
    <p class="confirmation-text">${bodyIntro}</p>
    ${invoiceDetailsTable([
      { label: "Invoice", value: invoiceAmountLine(invoice) },
      { label: "Due", value: dueDate },
    ])}
  `.trim()

  return generateBaseEmailTemplate(
    emailSubject,
    "",
    content,
    { text: "View invoice", url: invoiceViewUrl },
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

  return `
Dear ${invoice.customerName},

${bodyIntro}

Invoice: ${invoiceAmountLine(invoice)}
Due: ${dueDate}

View invoice: ${invoiceViewUrl}

---

${invoiceCustomerTextFooter(businessName, businessReplyEmail)}
  `.trim()
}

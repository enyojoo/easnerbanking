import { formatDate, formatCurrency } from "@/lib/utils"
import type { Invoice } from "@/lib/b2b/types"
import type { InvoicePdfIssuer } from "@/lib/invoices/issuer"
import { invoiceCustomerContactLine } from "@/lib/invoices/invoice-reply-email"

const EASNER_BUSINESS_LOGO =
  "https://seeqjiebmrnolcyydewj.supabase.co/storage/v1/object/public/brand/Easner%20Business.png"

const INVOICE_EMAIL_STYLES = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1C201E; background: #F6F3EB; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 30px; background: #F8F6F0; border-radius: 22px; }
    .logo { max-width: 140px; height: auto; margin-bottom: 24px; display: block; }
    .business-info { font-size: 14px; color: #6F756F; margin-bottom: 32px; }
    .business-info p { margin-bottom: 4px; }
    .greeting { font-size: 18px; font-weight: 600; color: #0F1110; margin-bottom: 20px; letter-spacing: -0.01em; }
    .body-text { font-size: 16px; color: #1C201E; margin-bottom: 24px; line-height: 1.7; }
    .invoice-details { background: #F6F3EB; border: 1px solid #D9D4C7; border-radius: 16px; padding: 20px; margin: 24px 0; }
    .invoice-details h3 { font-size: 12px; color: #6F756F; margin-bottom: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
    .invoice-details p { font-size: 16px; margin-bottom: 8px; color: #0F1110; }
    .cta { display: inline-block; background: #007ACC; color: #F6F3EB !important; text-decoration: none; padding: 14px 28px; border-radius: 16px; font-weight: 600; font-size: 15px; margin: 24px 0; letter-spacing: -0.005em; }
    .cta:hover { background: #0062A3; }
    .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid #D9D4C7; font-size: 14px; color: #6F756F; }
    .footer p { margin-bottom: 12px; }
    .copyright { font-size: 12px; color: #6F756F; margin-top: 20px; }
`

function wrapInvoiceEmailDocument(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${INVOICE_EMAIL_STYLES}</style>
</head>
<body>
  <div class="container">
    <img src="${EASNER_BUSINESS_LOGO}" alt="Easner Business" class="logo" width="140" />
    ${content}
    <p class="copyright">© 2026 Easner, Inc.</p>
  </div>
</body>
</html>
  `.trim()
}

function invoiceDetailsBlock(
  heading: string,
  rows: Array<{ strong?: boolean; text: string }>,
): string {
  const rowHtml = rows
    .map((row) =>
      row.strong ? `<p><strong>${row.text}</strong></p>` : `<p>${row.text}</p>`,
    )
    .join("\n      ")
  return `
    <div class="invoice-details">
      <h3>${heading}</h3>
      ${rowHtml}
    </div>
  `.trim()
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
  const amount = formatCurrency(invoice.total, invoice.currency)
  const customer = invoice.customerName?.trim() || "A customer"

  return wrapInvoiceEmailDocument(
    getInvoiceViewedNotificationSubject(invoice.invoiceNumber),
    `
    <p class="greeting">Hello ${businessName},</p>
    <p class="body-text">${customer} viewed invoice <strong>${invoice.invoiceNumber}</strong>.</p>
    ${invoiceDetailsBlock("Invoice details", [
      { strong: true, text: `Invoice #${invoice.invoiceNumber} – ${amount} ${invoice.currency}` },
      { text: `Customer: ${customer}` },
    ])}
    <a href="${manageInvoiceUrl}" class="cta">View invoice</a>
    <div class="footer">
      <p>You're receiving this because invoice view notifications are enabled in Easner Business.</p>
      <p>Manage this in Settings → Invoicing.</p>
    </div>
    `.trim(),
  )
}

export function generateInvoiceViewedNotificationText(
  data: InvoiceViewedNotificationEmailData,
): string {
  const { invoice, businessName, manageInvoiceUrl } = data
  const amount = formatCurrency(invoice.total, invoice.currency)
  const customer = invoice.customerName?.trim() || "A customer"

  return `
Hello ${businessName},

${customer} viewed invoice ${invoice.invoiceNumber}.

Invoice #${invoice.invoiceNumber} – ${amount} ${invoice.currency}
Customer: ${customer}

View invoice: ${manageInvoiceUrl}

---

You're receiving this because invoice view notifications are enabled in Easner Business.
Manage this in Settings → Invoicing.

© 2026 Easner, Inc.
  `.trim()
}

export function getInvoiceReceiptEmailSubject(invoiceNumber: string): string {
  return `Payment received for invoice ${invoiceNumber}`
}

export function generateInvoiceReceiptEmailHtml(data: InvoiceReceiptEmailData): string {
  const { invoice, invoiceViewUrl, businessName, businessReplyEmail } = data
  const amount = formatCurrency(invoice.total, invoice.currency)
  const businessInfoHtml = buildBusinessInfoHtml({
    invoice,
    invoiceViewUrl,
    businessName,
    businessReplyEmail,
    issuer: data.issuer,
  })
  const contact = invoiceContactFooter({
    invoice,
    invoiceViewUrl,
    businessName,
    businessReplyEmail,
    issuer: data.issuer,
  })

  return wrapInvoiceEmailDocument(
    getInvoiceReceiptEmailSubject(invoice.invoiceNumber),
    `
    <div class="business-info">
      ${businessInfoHtml}
    </div>
    <p class="greeting">Dear ${invoice.customerName},</p>
    <p class="body-text">Thank you — we received your payment for this invoice from ${businessName}.</p>
    ${invoiceDetailsBlock("Payment received", [
      { strong: true, text: `Invoice #${invoice.invoiceNumber} – ${amount} ${invoice.currency}` },
      { text: "Status: Paid" },
    ])}
    <a href="${invoiceViewUrl}" class="cta">View invoice</a>
    <div class="footer">
      <p>You're receiving this email because ${businessName} uses Easner Business Banking services to manage their business processes.</p>
      <p>${contact.html}</p>
    </div>
    `.trim(),
  )
}

export function generateInvoiceReceiptEmailText(data: InvoiceReceiptEmailData): string {
  const { invoice, invoiceViewUrl, businessName, businessReplyEmail } = data
  const amount = formatCurrency(invoice.total, invoice.currency)
  const contact = invoiceContactFooter({
    invoice,
    invoiceViewUrl,
    businessName,
    businessReplyEmail,
    issuer: data.issuer,
  })
  const businessLines = formatInvoiceEmailBusinessLines(data.issuer, businessReplyEmail)

  return `
Dear ${invoice.customerName},

${businessLines.length ? `${businessLines.join("\n")}\n\n` : ""}Thank you — we received your payment for this invoice from ${businessName}.

Invoice #${invoice.invoiceNumber} – ${amount} ${invoice.currency}
Status: Paid

View invoice: ${invoiceViewUrl}

---

You're receiving this email because ${businessName} uses Easner Business Banking services to manage their business processes. ${contact.text}

© 2026 Easner, Inc.
  `.trim()
}

export interface InvoiceEmailData {
  invoice: Invoice
  invoiceViewUrl: string
  businessName: string
  /** Merchant support email — used for Reply-To and footer contact line. */
  businessReplyEmail?: string
  /** Merchant address block shown in the email header. */
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

/** Plain-text lines for merchant header — skips empty address/contact fields. */
export function formatInvoiceEmailBusinessLines(
  issuer: InvoicePdfIssuer,
  replyEmail?: string,
): string[] {
  const lines: string[] = []
  const name = issuer.name?.trim()
  if (name) lines.push(name)

  const address = issuer.address?.trim()
  if (address) lines.push(address)

  const city = issuer.city?.trim()
  const state = issuer.state?.trim()
  const zip = issuer.zipCode?.trim()
  const cityLineParts: string[] = []
  if (city) cityLineParts.push(city)
  const stateZip = [state, zip].filter(Boolean).join(" ")
  if (stateZip) cityLineParts.push(stateZip)
  if (cityLineParts.length) lines.push(cityLineParts.join(", "))

  const country = issuer.country?.trim()
  if (country) lines.push(country)

  const email = replyEmail?.trim() || issuer.email?.trim()
  const phone = issuer.phone?.trim()
  const contactParts = [email, phone].filter(Boolean)
  if (contactParts.length) lines.push(contactParts.join(" | "))

  return lines
}

function buildBusinessInfoHtml(data: InvoiceEmailData): string {
  const lines = formatInvoiceEmailBusinessLines(data.issuer, data.businessReplyEmail)
  const fallbackName = data.businessName.trim() || data.issuer.name?.trim() || "Business"
  if (lines.length === 0) {
    return `<p><strong>${fallbackName}</strong></p>`
  }
  return lines
    .map((line, index) =>
      index === 0 ? `<p><strong>${line}</strong></p>` : `<p>${line}</p>`,
    )
    .join("\n      ")
}

function invoiceContactFooter(data: InvoiceEmailData): { html: string; text: string } {
  const merchantEmail = data.businessReplyEmail?.trim()
  if (!merchantEmail) {
    const support = process.env.SENDGRID_REPLY_TO?.trim() || "support@easner.com"
    return {
      html: `If you have any questions or think an error was made, please contact Easner at <a href="mailto:${support}">${support}</a>.`,
      text: `If you have any questions or think an error was made, please contact Easner at ${support}.`,
    }
  }
  const line = invoiceCustomerContactLine(data.businessName, merchantEmail)
  return {
    html: `If you have any questions about this invoice, contact <strong>${data.businessName}</strong> at <a href="mailto:${merchantEmail}">${merchantEmail}</a>.`,
    text: line,
  }
}

export function generateInvoiceEmailHtml(data: InvoiceEmailData): string {
  const { invoice, invoiceViewUrl, businessName } = data
  const dueDate = formatDate(invoice.dueDate, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const amount = formatCurrency(invoice.total, invoice.currency)
  const bodyIntro = getBodyIntro(data)
  const contact = invoiceContactFooter(data)
  const businessInfoHtml = buildBusinessInfoHtml(data)

  return wrapInvoiceEmailDocument(
    `Invoice ${invoice.invoiceNumber} - ${businessName}`,
    `
    <div class="business-info">
      ${businessInfoHtml}
    </div>
    <p class="greeting">Dear ${invoice.customerName},</p>
    <p class="body-text">${bodyIntro}</p>
    ${invoiceDetailsBlock("Invoice details", [
      { strong: true, text: `Invoice #${invoice.invoiceNumber} – ${amount} ${invoice.currency}` },
      { text: `Due: ${dueDate}` },
    ])}
    <a href="${invoiceViewUrl}" class="cta">View Invoice</a>
    <div class="footer">
      <p>You're receiving this email because ${businessName} uses Easner Business Banking services to manage their business processes.</p>
      <p>${contact.html}</p>
    </div>
    `.trim(),
  )
}

export function generateInvoiceEmailText(data: InvoiceEmailData): string {
  const { invoice, invoiceViewUrl, businessName } = data
  const dueDate = formatDate(invoice.dueDate, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const amount = formatCurrency(invoice.total, invoice.currency)
  const bodyIntro = getBodyIntroPlain(data)
  const contact = invoiceContactFooter(data)
  const businessLines = formatInvoiceEmailBusinessLines(data.issuer, data.businessReplyEmail)

  return `
Dear ${invoice.customerName},

${businessLines.length ? `${businessLines.join("\n")}\n\n` : ""}${bodyIntro}

Invoice #${invoice.invoiceNumber} – ${amount} ${invoice.currency}
Due: ${dueDate}

View Invoice: ${invoiceViewUrl}

---

You're receiving this email because ${businessName} uses Easner Business Banking services to manage their business processes. ${contact.text}

© 2026 Easner, Inc.
  `.trim()
}

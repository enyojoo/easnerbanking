import {
  customerGreetingParagraphHtml,
  formatCustomerGreetingPlain,
  generateBaseEmailTemplate,
  generateTransactionDetailsTable,
  EASNER_COMPANY_ADDRESS,
  EASNER_COMPANY_LEGAL_NAME,
} from "@easner/server"
import { formatTransactionWhen } from "@easner/shared"
import { formatCurrency } from "@/lib/utils"

export type CheckoutPayerReceiptEmailData = {
  customerName?: string | null
  businessName: string
  businessReplyEmail: string
  amountCents: number
  currency: string
  /** Payment link label, or “Online payment” for website checkout. */
  description: string
  paidAt: string
}

export function getCheckoutPayerReceiptEmailSubject(businessName: string): string {
  const name = businessName.trim() || "Easner"
  return `Receipt from ${name}`
}

function contactFooter(businessReplyEmail?: string): { html: string; text: string } {
  const merchantEmail = businessReplyEmail?.trim()
  if (!merchantEmail) {
    const support = process.env.SENDGRID_REPLY_TO?.trim() || "support@easner.com"
    return {
      html: `If you have any questions or think an error was made, email <a href="mailto:${support}" style="color: #007ACC; text-decoration: none; word-break: break-all;">${support}</a>.`,
      text: `If you have any questions or think an error was made, email ${support}.`,
    }
  }
  return {
    html: `If you have any questions about this payment, email <a href="mailto:${merchantEmail}" style="color: #007ACC; text-decoration: none; word-break: break-all;">${merchantEmail}</a>.`,
    text: `If you have any questions about this payment, email ${merchantEmail}.`,
  }
}

function footerDisclaimerHtml(businessName: string, businessReplyEmail: string): string {
  const contact = contactFooter(businessReplyEmail)
  return `
    <p class="footer-text">You're receiving this email because ${businessName} uses Easner Business Banking services to manage their business processes.</p>
    <p class="footer-text">${contact.html}</p>
  `.trim()
}

function textFooter(businessName: string, businessReplyEmail: string): string {
  const contact = contactFooter(businessReplyEmail)
  const year = new Date().getFullYear()
  return `You're receiving this email because ${businessName} uses Easner Business Banking services to manage their business processes.

${contact.text}

© ${year} ${EASNER_COMPANY_LEGAL_NAME} All rights reserved.
${EASNER_COMPANY_ADDRESS}`
}

function amountLine(data: CheckoutPayerReceiptEmailData): string {
  const amount = formatCurrency(data.amountCents / 100, data.currency)
  return `${amount} ${data.currency.toUpperCase()}`
}

function detailRows(data: CheckoutPayerReceiptEmailData) {
  const rows = [
    { label: "Amount", value: amountLine(data) },
    { label: "Paid for", value: data.description.trim() || "Online payment" },
  ]
  const when = formatTransactionWhen(data.paidAt)
  if (when) rows.push({ label: "When", value: when })
  rows.push({ label: "Status", value: "Paid", isStatus: true, statusClass: "completed" })
  return rows
}

export function generateCheckoutPayerReceiptEmailHtml(data: CheckoutPayerReceiptEmailData): string {
  const businessName = data.businessName.trim() || "Business"
  const subject = getCheckoutPayerReceiptEmailSubject(businessName)
  const description = data.description.trim() || "Online payment"

  const content = `
    ${customerGreetingParagraphHtml(data.customerName || "Customer")}
    <p class="confirmation-text">Thank you - we received your payment to ${businessName}.</p>
    ${generateTransactionDetailsTable(detailRows({ ...data, description, businessName }))}
  `.trim()

  return generateBaseEmailTemplate(subject, "", content, undefined, {
    audience: "business",
    showPreferencesLink: false,
    hideHeaderTitle: true,
    minimalFooter: true,
    preheader: `Payment received by ${businessName}`,
    footerDisclaimerHtml: footerDisclaimerHtml(businessName, data.businessReplyEmail),
  })
}

export function generateCheckoutPayerReceiptEmailText(data: CheckoutPayerReceiptEmailData): string {
  const businessName = data.businessName.trim() || "Business"
  const description = data.description.trim() || "Online payment"
  const when = formatTransactionWhen(data.paidAt)
  const lines = [
    formatCustomerGreetingPlain(data.customerName || "Customer"),
    "",
    `Thank you - we received your payment to ${businessName}.`,
    "",
    `Amount: ${amountLine(data)}`,
    `Paid for: ${description}`,
  ]
  if (when) lines.push(`When: ${when}`)
  lines.push("Status: Paid")

  return `${lines.join("\n")}

---

${textFooter(businessName, data.businessReplyEmail)}`.trim()
}

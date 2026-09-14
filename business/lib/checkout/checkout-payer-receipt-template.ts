import {
  customerGreetingParagraphHtml,
  formatCustomerGreetingPlain,
  generateBaseEmailTemplate,
  generateTransactionDetailsTable,
  EASNER_COMPANY_ADDRESS,
  EASNER_COMPANY_LEGAL_NAME,
  resolveEmailReplyTo,
} from "@easner/server"
import { formatTransactionWhen } from "@easner/shared"
import { formatCurrency } from "@/lib/utils"
import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"
import {
  formatPaymentMethodText,
  formatPaymentMethodTextBesideIcon,
  hasPaymentBrandIcon,
  paymentMethodIconKey,
  paymentBrandPngEmailUrl,
  shouldShowStripePaymentMethod,
} from "@/lib/stripe/payment-method-display"

export type CheckoutPayerReceiptEmailData = {
  customerName?: string | null
  businessName: string
  businessReplyEmail: string
  amountCents: number
  currency: string
  /** Payment link label, or “Online payment” for website checkout. */
  description: string
  paidAt: string
  /** IANA zone for the When row (server mail is otherwise UTC). */
  timeZone?: string | null
  paymentMethod?: StripePaymentMethodDisplay | null
}

export function getCheckoutPayerReceiptEmailSubject(businessName: string): string {
  const name = businessName.trim() || "Easner"
  return `Receipt from ${name}`
}

function contactFooter(businessReplyEmail?: string): { html: string; text: string } {
  const merchantEmail = businessReplyEmail?.trim()
  if (!merchantEmail) {
    const support = resolveEmailReplyTo()
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

function formatPaidWhen(data: CheckoutPayerReceiptEmailData): string {
  return formatTransactionWhen(data.paidAt, {
    timeZone: data.timeZone?.trim() || "UTC",
  })
}

function paymentMethodRow(data: CheckoutPayerReceiptEmailData): {
  label: string
  value: string
  brandIconSrc?: string
} | null {
  const pm = data.paymentMethod
  if (!shouldShowStripePaymentMethod(pm) || !pm) return null
  const iconKey = paymentMethodIconKey(pm)
  const brandIconSrc = hasPaymentBrandIcon(pm) ? paymentBrandPngEmailUrl(iconKey) : undefined
  const plainText = formatPaymentMethodText(pm).trim()
  if (!plainText) return null
  const htmlText = brandIconSrc
    ? formatPaymentMethodTextBesideIcon(pm).trim() || plainText
    : plainText
  return {
    label: "Payment method",
    value: htmlText,
    ...(brandIconSrc ? { brandIconSrc } : {}),
  }
}

export function generateCheckoutPayerReceiptEmailHtml(data: CheckoutPayerReceiptEmailData): string {
  const businessName = data.businessName.trim() || "Business"
  const subject = getCheckoutPayerReceiptEmailSubject(businessName)
  const description = data.description.trim() || "Online payment"

  const when = formatPaidWhen({ ...data, description, businessName })
  const pmRow = paymentMethodRow({ ...data, description, businessName })
  const rows = [
    { label: "Amount", value: amountLine(data) },
    { label: "Paid for", value: description },
    ...(when ? [{ label: "When", value: when }] : []),
    ...(pmRow ? [pmRow] : []),
    { label: "Status", value: "Paid", isStatus: true, statusClass: "completed" },
  ]

  const content = `
    ${customerGreetingParagraphHtml(data.customerName || "Customer")}
    <p class="confirmation-text">Thank you - we received your payment to ${businessName}.</p>
    ${generateTransactionDetailsTable(rows)}
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
  const when = formatPaidWhen(data)
  const pmText = data.paymentMethod ? formatPaymentMethodText(data.paymentMethod).trim() : ""
  const lines = [
    formatCustomerGreetingPlain(data.customerName || "Customer"),
    "",
    `Thank you - we received your payment to ${businessName}.`,
    "",
    `Amount: ${amountLine(data)}`,
    `Paid for: ${description}`,
  ]
  if (when) lines.push(`When: ${when}`)
  if (pmText) lines.push(`Payment method: ${pmText}`)
  lines.push("Status: Paid")

  return `${lines.join("\n")}

---

${textFooter(businessName, data.businessReplyEmail)}`.trim()
}

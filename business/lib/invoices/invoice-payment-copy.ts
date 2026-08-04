import { formatCurrency } from "@/lib/utils"
import { invoicePublicViewPath } from "@/lib/invoice-public-url"
import type { Invoice } from "@/lib/b2b/types"

export type PaymentMethodsFlags = {
  hasOnline: boolean
  hasBank: boolean
  hasStablecoin: boolean
}

export type InvoicePdfPaymentSection = PaymentMethodsFlags & {
  url: string
}

const PAYABLE = new Set(["open", "sent", "past_due"])

export function isInvoicePayable(status: string): boolean {
  return PAYABLE.has(status)
}

export function hasAnyPaymentMethod(flags: PaymentMethodsFlags): boolean {
  return flags.hasOnline || flags.hasBank || flags.hasStablecoin
}

export function buildInvoiceViewUrl(
  baseUrl: string,
  easetag: string | null | undefined,
  invoice: Pick<Invoice, "id" | "invoiceNumber">,
): string {
  const origin = baseUrl.replace(/\/$/, "")
  if (easetag?.trim()) {
    return `${origin}${invoicePublicViewPath(easetag.trim(), invoice.invoiceNumber)}`
  }
  return `${origin}/invoice-view/${invoice.id}`
}

export function customerPaymentOptionsTitle(): string {
  return "Payment options"
}

/** Customer-facing subtitle on the live invoice view (dynamic by available rails). */
export function customerPaymentOptionsSubtitle(
  invoiceNumber: string,
  flags: PaymentMethodsFlags,
): string {
  const ref = invoiceNumber.trim()
  const { hasOnline, hasBank, hasStablecoin } = flags

  if (hasOnline && hasBank && hasStablecoin) {
    return `Pay online for instant confirmation and an email receipt. For bank transfers, include ${ref} as the payment reference. For stablecoin, send only the token and network shown below.`
  }
  if (hasOnline && hasBank) {
    return `Pay online for instant confirmation, or pay by bank transfer. For bank payments, include ${ref} as the reference.`
  }
  if (hasOnline && hasStablecoin) {
    return `Pay online for instant confirmation, or send stablecoin using the details below.`
  }
  if (hasBank && hasStablecoin) {
    return `Pay by bank or stablecoin using the details below. For bank transfers, include ${ref} as the payment reference.`
  }
  if (hasOnline) {
    return "Pay securely below. You'll receive a receipt by email when payment is complete."
  }
  if (hasBank) {
    return `Transfer the total using the account details below. Include ${ref} as the payment reference.`
  }
  if (hasStablecoin) {
    return "Send the exact invoice amount using the address and network below."
  }
  return "Choose how you'd like to pay this invoice."
}

export function onlinePaymentTabHint(customerEmail?: string | null): string {
  const email = customerEmail?.trim()
  if (email) {
    return `Pay with card, bank debit, or other methods available in your region. Receipt sent to ${email}.`
  }
  return "Pay with card, bank debit, or other methods available in your region."
}

export function bankPaymentExtraInstruction(invoiceNumber: string): string {
  return `Include ${invoiceNumber.trim()} in the payment reference or narration.`
}

export function stablecoinPaymentExtraInstruction(total: number, currency: string): string {
  return `Send the exact amount: ${formatCurrency(total, currency)}.`
}

/** Lines for the PDF payment section (link-first; rails live on the web view). */
export function pdfPaymentSectionLines(
  invoice: Pick<Invoice, "invoiceNumber" | "total" | "currency">,
  section: InvoicePdfPaymentSection,
): string[] {
  const amount = formatCurrency(invoice.total, invoice.currency)
  const lines: string[] = [
    "View and pay this invoice online. Choose card, bank transfer, or stablecoin on the payment page.",
    "",
    `Amount due: ${amount}`,
    `Invoice: ${invoice.invoiceNumber.trim()}`,
    "",
    section.url,
  ]

  if (section.hasBank) {
    lines.push("", `For bank transfers, include ${invoice.invoiceNumber.trim()} as the payment reference.`)
  }
  if (section.hasStablecoin) {
    lines.push("", `For stablecoin, send exactly ${amount} using the token and network shown on the payment page.`)
  }

  return lines
}

/** Short paragraph inserted in invoice emails when payment context is enabled. */
export function emailPaymentContextParagraph(flags: PaymentMethodsFlags): string {
  const parts: string[] = []
  if (flags.hasOnline) parts.push("pay online")
  if (flags.hasBank) parts.push("bank transfer")
  if (flags.hasStablecoin) parts.push("stablecoin")

  if (parts.length === 0) {
    return "Open the link below to view this invoice."
  }
  if (parts.length === 1) {
    return `You can ${parts[0]} using the link below. Payment details are on the invoice page.`
  }
  const last = parts.pop()
  return `You can ${parts.join(", ")}, or ${last} using the link below. All payment options are on the invoice page.`
}

export function emailPrimaryCtaText(
  status: string,
  flags: PaymentMethodsFlags,
  includePaymentContext: boolean,
): string {
  if (
    includePaymentContext &&
    isInvoicePayable(status) &&
    hasAnyPaymentMethod(flags)
  ) {
    return "View & pay invoice"
  }
  return "View invoice"
}

export function buildInvoicePdfPaymentSection(input: {
  baseUrl: string
  easetag: string | null | undefined
  invoice: Pick<Invoice, "id" | "invoiceNumber" | "status">
  flags: PaymentMethodsFlags
  includeOnPdf: boolean
}): InvoicePdfPaymentSection | undefined {
  if (!input.includeOnPdf || !isInvoicePayable(input.invoice.status)) {
    return undefined
  }
  if (!hasAnyPaymentMethod(input.flags)) {
    return undefined
  }
  return {
    url: buildInvoiceViewUrl(input.baseUrl, input.easetag, input.invoice),
    ...input.flags,
  }
}

export function paymentFlagsFromDisplay(display: {
  showOnlinePayment: boolean
  showBank: boolean
  showStablecoin: boolean
}): PaymentMethodsFlags {
  return {
    hasOnline: display.showOnlinePayment,
    hasBank: display.showBank,
    hasStablecoin: display.showStablecoin,
  }
}

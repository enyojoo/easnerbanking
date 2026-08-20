import { formatCurrency } from "@/lib/utils"
import { buildInvoiceCustomerUrl } from "@/lib/invoice-public-url"
import type { Invoice } from "@/lib/b2b/types"

export type PaymentMethodsFlags = {
  hasOnline: boolean
  hasBank: boolean
  hasStablecoin: boolean
}

export type InvoicePdfPaymentSection = PaymentMethodsFlags & {
  url: string
}

const PAYABLE = new Set(["unpaid", "sent", "past_due"])

export function isInvoicePayable(status: string): boolean {
  return PAYABLE.has(status)
}

export function hasAnyPaymentMethod(flags: PaymentMethodsFlags): boolean {
  return flags.hasOnline || flags.hasBank || flags.hasStablecoin
}

export type InvoicePaymentTab = "online" | "bank" | "stablecoin"

export function countPaymentMethods(flags: PaymentMethodsFlags): number {
  return [flags.hasOnline, flags.hasBank, flags.hasStablecoin].filter(Boolean).length
}

/** Section heading when the customer chooses between rails; null for a single method. */
export function customerPaymentSectionTitle(flags: PaymentMethodsFlags): string | null {
  if (countPaymentMethods(flags) <= 1) return null
  return "Payment options"
}

export function customerPaymentMethodTitle(tab: InvoicePaymentTab): string {
  switch (tab) {
    case "online":
      return "Pay online"
    case "bank":
      return "Bank transfer"
    case "stablecoin":
      return "Pay with stablecoin"
  }
}

/** Short intro when two or more payment methods are available. */
export function customerPaymentChooserSubtitle(_flags?: PaymentMethodsFlags): string {
  return "Choose how to pay this invoice."
}

/** Customer-facing intro when only one payment method is available. */
export function customerSingleMethodSubtitle(
  tab: InvoicePaymentTab,
  invoiceNumber: string,
): string {
  const ref = invoiceNumber.trim()
  if (tab === "online") return onlinePaymentTabHint()
  if (tab === "bank") {
    return `Transfer the total using the account details below. Include ${ref} as the payment reference.`
  }
  return "Send the exact invoice amount using the address and network below."
}

/** Per-tab hint when multiple methods are shown (rail-specific details). */
export function customerPaymentTabHint(
  tab: InvoicePaymentTab,
  invoiceNumber: string,
): string {
  const ref = invoiceNumber.trim()
  switch (tab) {
    case "online":
      return onlinePaymentTabHint()
    case "bank":
      return `Include ${ref} as the payment reference.`
    case "stablecoin":
      return "Send only the token and network shown below."
  }
}

/** Resolved customer section title for any method count. */
export function customerPaymentDisplayTitle(flags: PaymentMethodsFlags): string {
  const sectionTitle = customerPaymentSectionTitle(flags)
  if (sectionTitle) return sectionTitle
  if (flags.hasOnline) return customerPaymentMethodTitle("online")
  if (flags.hasBank) return customerPaymentMethodTitle("bank")
  return customerPaymentMethodTitle("stablecoin")
}

/** Resolved customer subtitle for the payment section header. */
export function customerPaymentDisplaySubtitle(
  invoiceNumber: string,
  flags: PaymentMethodsFlags,
): string {
  const count = countPaymentMethods(flags)
  if (count <= 1) {
    const tab: InvoicePaymentTab = flags.hasOnline
      ? "online"
      : flags.hasBank
        ? "bank"
        : "stablecoin"
    return customerSingleMethodSubtitle(tab, invoiceNumber)
  }
  return customerPaymentChooserSubtitle(flags)
}

export function buildInvoiceViewUrl(
  easetag: string | null | undefined,
  invoice: Pick<Invoice, "id" | "invoiceNumber">,
): string {
  return buildInvoiceCustomerUrl(easetag, invoice)
}

/** @deprecated Use customerPaymentDisplayTitle */
export function customerPaymentOptionsTitle(): string {
  return "Payment options"
}

/** @deprecated Use customerPaymentDisplaySubtitle */
export function customerPaymentOptionsSubtitle(
  invoiceNumber: string,
  flags: PaymentMethodsFlags,
): string {
  return customerPaymentDisplaySubtitle(invoiceNumber, flags)
}

export function onlinePaymentTabHint(): string {
  return "Pay with card, bank debit, or other methods available."
}

/** Short tab labels – fit 3-up on mobile; details live inside each tab. */
export function invoicePaymentTabLabel(tab: "online" | "bank" | "stablecoin"): string {
  switch (tab) {
    case "online":
      return "Pay online"
    case "bank":
      return "Bank"
    case "stablecoin":
      return "Stablecoin"
  }
}

export function bankPaymentExtraInstruction(invoiceNumber: string): string {
  return `Include ${invoiceNumber.trim()} in the payment reference or narration.`
}

export function stablecoinPaymentExtraInstruction(total: number, currency: string): string {
  return `Send the exact amount: ${formatCurrency(total, currency)}.`
}

function pdfPaymentIntroLine(flags: PaymentMethodsFlags): string {
  const count = countPaymentMethods(flags)
  if (count === 1) {
    if (flags.hasOnline) {
      return "View and pay this invoice online by card, bank debit, or other methods available in your region."
    }
    if (flags.hasBank) {
      return "View this invoice and pay by bank transfer using the account details on the payment page."
    }
    return "View this invoice and pay with stablecoin using the address and network on the payment page."
  }
  return "View and pay this invoice online. Choose your preferred payment method on the payment page."
}

/** Lines for the PDF payment section (link-first; rails live on the web view). */
export function pdfPaymentSectionLines(
  invoice: Pick<Invoice, "invoiceNumber" | "total" | "currency">,
  section: InvoicePdfPaymentSection,
): string[] {
  const amount = formatCurrency(invoice.total, invoice.currency)
  const ref = invoice.invoiceNumber.trim()
  const lines: string[] = [
    pdfPaymentIntroLine(section),
    "",
    `Amount due: ${amount}`,
    `Invoice: ${ref}`,
    "",
    section.url,
  ]

  const count = countPaymentMethods(section)
  if (count > 1 && section.hasBank) {
    lines.push("", `For bank transfers, include ${ref} as the payment reference.`)
  }
  if (count > 1 && section.hasStablecoin) {
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
    url: buildInvoiceViewUrl(input.easetag, input.invoice),
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

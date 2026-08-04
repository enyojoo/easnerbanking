import type { InvoicePaymentDefaults } from "@/lib/b2b/types"

export const DEFAULT_INVOICE_PAYMENT_DEFAULTS: InvoicePaymentDefaults = {
  showBankTransfer: true,
  showStablecoin: true,
  showOnlinePayment: true,
  preferredMethod: "customer_choice",
  includePaymentOnPdf: true,
  includePaymentInEmail: true,
  notifyOnInvoiceView: true,
  notifyOnInvoicePaid: true,
  sendReceiptOnPaid: true,
}

export type BusinessInvoiceSettings = InvoicePaymentDefaults & {
  brandColor?: string
  footerText?: string
  /** Email reminder on the due date (default true). */
  sendDueDateReminder?: boolean
  /** Email reminder ~7 days after due date (default true). */
  sendOverdueReminder?: boolean
}

export function parseBusinessInvoiceSettings(raw: unknown): BusinessInvoiceSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_INVOICE_PAYMENT_DEFAULTS }
  }
  const o = raw as Record<string, unknown>
  return {
    ...DEFAULT_INVOICE_PAYMENT_DEFAULTS,
    showBankTransfer: o.showBankTransfer !== false,
    showStablecoin: o.showStablecoin !== false,
    showOnlinePayment: o.showOnlinePayment !== false,
    preferredMethod:
      o.preferredMethod === "bank" ||
      o.preferredMethod === "stablecoin" ||
      o.preferredMethod === "online" ||
      o.preferredMethod === "customer_choice"
        ? o.preferredMethod
        : DEFAULT_INVOICE_PAYMENT_DEFAULTS.preferredMethod,
    includePaymentOnPdf: o.includePaymentOnPdf !== false,
    includePaymentInEmail: o.includePaymentInEmail !== false,
    notifyOnInvoiceView: o.notifyOnInvoiceView !== false,
    notifyOnInvoicePaid: o.notifyOnInvoicePaid !== false,
    sendReceiptOnPaid: o.sendReceiptOnPaid !== false,
    brandColor: typeof o.brandColor === "string" ? o.brandColor : undefined,
    footerText: typeof o.footerText === "string" ? o.footerText : undefined,
    sendDueDateReminder: o.sendDueDateReminder !== false,
    sendOverdueReminder: o.sendOverdueReminder !== false,
  }
}

export function invoiceSettingsToDbPayload(
  settings: Partial<BusinessInvoiceSettings>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(settings)) as Record<string, unknown>
}

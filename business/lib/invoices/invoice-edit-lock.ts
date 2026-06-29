import type { Invoice } from "@/lib/b2b/types"

/** Customer, currency, and line amounts are locked once the invoice is actively out with the customer. */
export function isInvoiceFieldsLocked(status: Invoice["status"]): boolean {
  return status === "sent" || status === "past_due"
}

export function invoiceFieldsLockBanner(status: Invoice["status"]): string | null {
  if (!isInvoiceFieldsLocked(status)) return null
  return "This invoice has been shared with your customer. Customer, currency, and line amounts are locked. Void and reissue to change amounts."
}

/** Merchant can preview customer view + payment block while drafting or before send. */
export function showInvoicePaymentPreview(status: Invoice["status"], documentType?: Invoice["documentType"]): boolean {
  if (documentType === "quote" || status === "quote") return false
  return ["draft", "open", "sent", "past_due"].includes(status)
}

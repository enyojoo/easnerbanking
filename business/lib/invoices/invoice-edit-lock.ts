import type { Invoice } from "@/lib/b2b/types"
import { INVOICE_BANNER_COPY } from "@/lib/copy/business-ui-copy"

/** Customer, currency, and line amounts are locked once the invoice is actively out with the customer. */
export function isInvoiceFieldsLocked(status: Invoice["status"]): boolean {
  return status === "sent" || status === "past_due"
}

export function invoiceFieldsLockBanner(status: Invoice["status"]): string | null {
  if (!isInvoiceFieldsLocked(status)) return null
  return INVOICE_BANNER_COPY.fieldsLocked
}

export {
  showInvoicePaymentPreview,
  isInvoiceCustomerLinkShareable,
  isInvoicePubliclyViewable,
  isInvoiceDraft,
} from "@/lib/invoices/invoice-status"

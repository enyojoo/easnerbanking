import {
  resolveInvoiceFromEmailAddress,
  resolveInvoiceFromName,
  resolveReceiptFromEmailAddress,
} from "@easner/server"

/** From address for customer-facing invoice emails (not merchant Reply-To). */
export function resolveInvoiceFromEmail(): { email: string; name: string } {
  return {
    email: resolveInvoiceFromEmailAddress(),
    name: resolveInvoiceFromName(),
  }
}

/** From for Payment Link / website-checkout receipts (invoices stay on invoices@). */
export function resolveReceiptFromEmail(): { email: string; name: string } {
  return {
    email: resolveReceiptFromEmailAddress(),
    name: resolveInvoiceFromName(),
  }
}

function easnerBusinessFromName(override?: string): string {
  return (
    override?.trim() ||
    process.env.SENDGRID_FROM_NAME_BUSINESS?.trim() ||
    "Easner Business"
  )
}

/** SendGrid From address for customer-facing invoice emails (not merchant Reply-To). */
export function resolveInvoiceFromEmail(): { email: string; name: string } {
  return {
    email: process.env.SENDGRID_FROM_EMAIL_INVOICES?.trim() || "invoices@easner.com",
    name: easnerBusinessFromName(process.env.SENDGRID_FROM_NAME_INVOICES),
  }
}

/** SendGrid From for Payment Link / website-checkout receipts (invoices stay on invoices@). */
export function resolveReceiptFromEmail(): { email: string; name: string } {
  return {
    email: process.env.SENDGRID_FROM_EMAIL_RECEIPTS?.trim() || "receipt@easner.com",
    name: easnerBusinessFromName(process.env.SENDGRID_FROM_NAME_INVOICES),
  }
}

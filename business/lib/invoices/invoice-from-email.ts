/** SendGrid From address for customer-facing invoice emails (not merchant Reply-To). */
export function resolveInvoiceFromEmail(): { email: string; name: string } {
  return {
    email: process.env.SENDGRID_FROM_EMAIL_INVOICES?.trim() || "invoices@easner.com",
    name:
      process.env.SENDGRID_FROM_NAME_INVOICES?.trim() ||
      process.env.SENDGRID_FROM_NAME_BUSINESS?.trim() ||
      "Easner Business",
  }
}

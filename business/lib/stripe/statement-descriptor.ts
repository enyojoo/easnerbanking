/** Build a Stripe statement_descriptor_suffix (max 22 chars). */

function sanitizeAlnum(raw: string): string {
  return String(raw || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim()
    .toUpperCase()
}

/**
 * Platform MoR suffix — Easner is on the statement. Invoices carry their number
 * ("EASNER* INV ACME2024"); other collections carry the business name so the payer
 * recognizes the charge.
 */
export function buildEasnerStatementSuffix(input: {
  invoiceNumber?: string | null
  businessName?: string | null
}): string {
  const inv = sanitizeAlnum(String(input.invoiceNumber ?? "")).slice(0, 14)
  if (inv) return `INV ${inv}`.slice(0, 22)
  return sanitizeAlnum(String(input.businessName ?? "")).slice(0, 22) || "PAYMENT"
}

/** @deprecated Prefer buildEasnerStatementSuffix for platform MoR. */
export function buildStatementDescriptorSuffix(input: {
  businessName?: string | null
  invoiceNumber?: string | null
}): string {
  return buildEasnerStatementSuffix({ invoiceNumber: input.invoiceNumber })
}

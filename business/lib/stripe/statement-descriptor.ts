/** Build a Stripe statement_descriptor_suffix (max 22 chars). */

function sanitizeAlnum(raw: string): string {
  return String(raw || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim()
    .toUpperCase()
}

/**
 * Platform MoR suffix — Easner is on the statement; invoice number only.
 * Dashboard prefix should be EASNER → "EASNER* INV ACME2024"
 */
export function buildEasnerStatementSuffix(input: {
  invoiceNumber?: string | null
}): string {
  const inv = sanitizeAlnum(String(input.invoiceNumber ?? "")).slice(0, 14) || "INVOICE"
  return `INV ${inv}`.trim().slice(0, 22)
}

/** @deprecated Prefer buildEasnerStatementSuffix for platform MoR. */
export function buildStatementDescriptorSuffix(input: {
  businessName?: string | null
  invoiceNumber?: string | null
}): string {
  return buildEasnerStatementSuffix({ invoiceNumber: input.invoiceNumber })
}

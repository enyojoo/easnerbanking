/** Build a Stripe statement_descriptor_suffix (max 22 chars). */

function sanitizeAlnum(raw: string): string {
  return String(raw || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim()
    .toUpperCase()
}

function sanitizeDescriptor(raw: string): string {
  return String(raw || "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

/**
 * Connected-account statement descriptor (Direct Charges). The business name is
 * the merchant of record on the card; 5–22 Latin characters, at least one letter.
 */
export function buildConnectedAccountStatementDescriptor(businessName?: string | null): string {
  const sliced = sanitizeDescriptor(String(businessName ?? "")).slice(0, 22).trim()
  if (sliced.length >= 5 && /[A-Z]/.test(sliced)) return sliced
  return "PAYMENT"
}

/**
 * Suffix on the connected account. Invoices carry their number (`INV ACME2024`);
 * other collections can omit it so the business descriptor stands alone.
 */
export function buildEasnerStatementSuffix(input: {
  invoiceNumber?: string | null
  businessName?: string | null
}): string {
  const inv = sanitizeAlnum(String(input.invoiceNumber ?? "")).slice(0, 14)
  if (inv) return `INV ${inv}`.slice(0, 22)
  return sanitizeAlnum(String(input.businessName ?? "")).slice(0, 22) || "PAYMENT"
}

/** @deprecated Prefer buildEasnerStatementSuffix. */
export function buildStatementDescriptorSuffix(input: {
  businessName?: string | null
  invoiceNumber?: string | null
}): string {
  return buildEasnerStatementSuffix({ invoiceNumber: input.invoiceNumber })
}

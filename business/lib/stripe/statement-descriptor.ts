/** Build a Stripe statement_descriptor_suffix (max 22 chars). */
export function buildStatementDescriptorSuffix(input: {
  businessName?: string | null
  invoiceNumber?: string | null
}): string {
  const biz = String(input.businessName ?? "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .toUpperCase()
  const inv = String(input.invoiceNumber ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim()
    .toUpperCase()

  const bizPart = biz.slice(0, 8) || "EASNER"
  const invPart = inv.slice(0, 10) || "INVOICE"
  const combined = `${bizPart} ${invPart}`.trim()
  return combined.slice(0, 22)
}

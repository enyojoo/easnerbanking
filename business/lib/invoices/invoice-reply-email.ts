/** Reply-To resolution for invoice emails (no heavy imports — safe for unit tests). */

export type InvoiceReplyEmailSource = "support" | "owner" | "sender"

export function pickInvoiceReplyEmailWithSource(input: {
  supportEmail?: string | null
  ownerEmail?: string | null
  senderEmail?: string | null
}): { email: string; source: InvoiceReplyEmailSource } | null {
  const support = typeof input.supportEmail === "string" ? input.supportEmail.trim() : ""
  if (support) return { email: support, source: "support" }

  const owner = typeof input.ownerEmail === "string" ? input.ownerEmail.trim() : ""
  if (owner) return { email: owner, source: "owner" }

  const sender = typeof input.senderEmail === "string" ? input.senderEmail.trim() : ""
  if (sender) return { email: sender, source: "sender" }

  return null
}

export function pickInvoiceReplyEmail(input: {
  supportEmail?: string | null
  ownerEmail?: string | null
  senderEmail?: string | null
}): string | null {
  return pickInvoiceReplyEmailWithSource(input)?.email ?? null
}

export function invoiceCustomerContactLine(
  businessName: string,
  businessReplyEmail: string,
): string {
  return `If you have any questions about this invoice, contact ${businessName} at ${businessReplyEmail.trim()}.`
}

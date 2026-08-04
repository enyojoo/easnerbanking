import { normalizeEasetag } from "@/lib/easetag-validation"
import type { Invoice } from "@/lib/b2b/types"

/**
 * Public customer-facing invoice URL (business @easetag + invoice number).
 * Invoice number segment is lowercased for stable, readable URLs.
 */
export function invoiceCustomerViewPath(easetag: string, invoiceNumber: string): string {
  const tag = normalizeEasetag(easetag)
  const num = invoiceNumber.trim().toLowerCase()
  return `/invoice/${encodeURIComponent(tag)}/${encodeURIComponent(num)}`
}

/** Public customer link when the business has no @easetag yet (UUID acts as capability token). */
export function invoiceCustomerViewPathById(invoiceId: string): string {
  return `/invoice/${encodeURIComponent(invoiceId)}`
}

/** Authenticated business preview of the customer invoice page. */
export function invoicePreviewPath(invoiceId: string): string {
  return `/invoice/preview/${encodeURIComponent(invoiceId)}`
}

/** @deprecated Prefer `invoiceCustomerViewPath`. */
export function invoicePublicViewPath(easetag: string, invoiceNumber: string): string {
  return invoiceCustomerViewPath(easetag, invoiceNumber)
}

export function buildInvoiceCustomerViewPath(
  easetag: string | null | undefined,
  invoice: Pick<Invoice, "id" | "invoiceNumber">,
): string {
  if (easetag?.trim()) {
    return invoiceCustomerViewPath(easetag.trim(), invoice.invoiceNumber)
  }
  return invoiceCustomerViewPathById(invoice.id)
}

export function buildInvoiceCustomerViewUrl(
  baseUrl: string,
  easetag: string | null | undefined,
  invoice: Pick<Invoice, "id" | "invoiceNumber">,
): string {
  const origin = baseUrl.replace(/\/$/, "")
  return `${origin}${buildInvoiceCustomerViewPath(easetag, invoice)}`
}

export function buildInvoicePreviewUrl(
  baseUrl: string,
  invoiceId: string,
): string {
  const origin = baseUrl.replace(/\/$/, "")
  return `${origin}${invoicePreviewPath(invoiceId)}`
}

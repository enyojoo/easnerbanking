import { normalizeEasetag } from "@/lib/easetag-validation"

/**
 * Public customer-facing invoice URL (business @easetag + invoice number; no Supabase ids).
 * Invoice number segment is lowercased for stable, readable URLs.
 * Legacy `/invoice-view/:invoiceRowUuid` remains supported for old links.
 */
export function invoicePublicViewPath(easetag: string, invoiceNumber: string): string {
  const tag = normalizeEasetag(easetag)
  const num = invoiceNumber.trim().toLowerCase()
  return `/invoice-view/${encodeURIComponent(tag)}/${encodeURIComponent(num)}`
}

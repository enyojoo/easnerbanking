import { isInvoiceAppHostname, isPayAppHostname } from "@/lib/customer-hosts"

export type CustomerPublicKind = "pay" | "invoice" | "pay_thanks"

const INVOICE_NUMBER_RE = /^einv-/i
const PAYMENT_LINK_PUBLIC_ID_RE = /^plink_/i

/**
 * Decide which payer surface a public URL is. Host wins when it is pay/invoice;
 * otherwise infer from the path so Vercel Host mismatches still render.
 */
export function resolveCustomerPublicKind(
  hostname: string | null | undefined,
  parts: string[],
): CustomerPublicKind | null {
  const segments = parts.map((part) => part.trim()).filter(Boolean)
  if (segments.length === 0) return null

  if (segments.length === 1 && segments[0].toLowerCase() === "thanks") {
    if (isInvoiceAppHostname(hostname)) return null
    return "pay_thanks"
  }

  if (isPayAppHostname(hostname)) return "pay"
  if (isInvoiceAppHostname(hostname)) return "invoice"

  if (segments.length >= 2 && INVOICE_NUMBER_RE.test(segments[1])) return "invoice"
  if (segments.length === 1 && PAYMENT_LINK_PUBLIC_ID_RE.test(segments[0])) return "pay"
  if (segments.length >= 2) return "pay"
  return "pay"
}

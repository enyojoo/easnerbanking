/**
 * Customer-facing hosts. Same Next app as the operator dashboard; middleware
 * rewrites each host into its own route tree.
 */

const DEFAULT_INVOICE_APP_ORIGIN = "https://invoice.easner.com"
const DEFAULT_PAY_APP_ORIGIN = "https://pay.easner.com"

function normalizeOrigin(raw: string): string {
  try {
    return new URL(raw).origin
  } catch {
    return raw.replace(/\/$/, "")
  }
}

/** Public origin for invoice view + Pay online pages. */
export function getInvoiceAppPublicOrigin(): string {
  const env = process.env.NEXT_PUBLIC_INVOICE_APP_URL?.trim() || ""
  return env ? normalizeOrigin(env) : DEFAULT_INVOICE_APP_ORIGIN
}

/** Public origin for Payment Link, stablecoin charge, and thank-you pages. */
export function getPayAppPublicOrigin(): string {
  const env = process.env.NEXT_PUBLIC_PAY_APP_URL?.trim() || ""
  return env ? normalizeOrigin(env) : DEFAULT_PAY_APP_ORIGIN
}

function hostnameOf(origin: string, fallback: string): string {
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return fallback
  }
}

/** Hostname (no scheme or port) the proxy matches to route invoice requests. */
export function getInvoiceAppHostname(): string {
  return hostnameOf(getInvoiceAppPublicOrigin(), "invoice.easner.com")
}

export function getPayAppHostname(): string {
  return hostnameOf(getPayAppPublicOrigin(), "pay.easner.com")
}

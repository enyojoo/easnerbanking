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

function normalizeHostname(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    ?.split(":")[0] ?? ""
}

/** True for invoice.easner.com / pay.easner.com (and env overrides). */
export function isCustomerAppHostname(hostname: string | null | undefined): boolean {
  const host = normalizeHostname(hostname)
  if (!host) return false
  return host === getInvoiceAppHostname() || host === getPayAppHostname()
}

/**
 * Host used for public vs workspace chrome. Prefer a customer app host when
 * proxies send both the deployment URL and pay/invoice.easner.com.
 */
export function pickPublicHostname(
  forwardedHost: string | null | undefined,
  hostHeader: string | null | undefined,
): string | null {
  const candidates: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | null | undefined) => {
    if (!raw) return
    for (const part of raw.split(",")) {
      const host = normalizeHostname(part)
      if (host && !seen.has(host)) {
        seen.add(host)
        candidates.push(host)
      }
    }
  }
  push(forwardedHost)
  push(hostHeader)
  return candidates.find((host) => isCustomerAppHostname(host)) ?? candidates[0] ?? null
}

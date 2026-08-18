import { isCustomerAppHostname } from "@/lib/customer-hosts"

/** Routes that should not mount workspace chrome (DashboardShell, Intercom, RQ persist, etc.). */
export const PUBLIC_SURFACE_PREFIXES = ["/auth", "/invoice", "/pay-customer", "/pay"] as const

const OPERATOR_FIRST_SEGMENTS = new Set([
  "accounts",
  "auth",
  "cards",
  "checkout",
  "dashboard",
  "developers",
  "invoice",
  "invoices",
  "links",
  "og",
  "pay",
  "pay-customer",
  "payroll",
  "send",
  "settings",
  "terminal",
  "transactions",
])

function isCustomerShapedPathname(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean)
  if (parts.length === 1 && (parts[0].toLowerCase() === "thanks" || parts[0].toLowerCase().startsWith("plink_"))) {
    return true
  }
  if (parts.length >= 2 && /^einv-/i.test(parts[1])) return true
  if (parts.length === 2 && !OPERATOR_FIRST_SEGMENTS.has(parts[0].toLowerCase())) return true
  return false
}

export function isPublicSurfacePath(
  pathname: string | null | undefined,
  hostname?: string | null,
): boolean {
  if (isCustomerAppHostname(hostname)) return true
  if (!pathname) return false
  if (
    PUBLIC_SURFACE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true
  }
  return isCustomerShapedPathname(pathname)
}

export function isWorkspaceSurfacePath(
  pathname: string | null | undefined,
  hostname?: string | null,
): boolean {
  return Boolean(pathname) && !isPublicSurfacePath(pathname, hostname)
}

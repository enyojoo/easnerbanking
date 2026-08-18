import { isCustomerAppHostname } from "@/lib/customer-hosts"

/** Routes that should not mount workspace chrome (DashboardShell, Intercom, RQ persist, etc.). */
export const PUBLIC_SURFACE_PREFIXES = ["/auth", "/invoice", "/pay-customer", "/pay"] as const

export function isPublicSurfacePath(
  pathname: string | null | undefined,
  hostname?: string | null,
): boolean {
  if (isCustomerAppHostname(hostname)) return true
  if (!pathname) return false
  return PUBLIC_SURFACE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function isWorkspaceSurfacePath(
  pathname: string | null | undefined,
  hostname?: string | null,
): boolean {
  return Boolean(pathname) && !isPublicSurfacePath(pathname, hostname)
}

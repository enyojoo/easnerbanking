/** Routes that should not mount workspace chrome (DashboardShell, Intercom, RQ persist, etc.). */
export const PUBLIC_SURFACE_PREFIXES = ["/auth", "/invoice", "/pay"] as const

export function isPublicSurfacePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return PUBLIC_SURFACE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function isWorkspaceSurfacePath(pathname: string | null | undefined): boolean {
  return Boolean(pathname) && !isPublicSurfacePath(pathname)
}

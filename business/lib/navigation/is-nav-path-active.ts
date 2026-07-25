export function isNavPathActive(pathname: string, href: string): boolean {
  if (!href.startsWith("/")) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}

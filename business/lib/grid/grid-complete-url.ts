/** True when href is our Grid hosted KYB return page. */
export function isGridCompleteUrl(href: string): boolean {
  try {
    const url = new URL(href, typeof window !== "undefined" ? window.location.origin : "http://localhost")
    return url.pathname.endsWith("/auth/grid-complete")
  } catch {
    return href.includes("/auth/grid-complete")
  }
}

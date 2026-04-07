import type { ReadonlyURLSearchParams } from "next/navigation"

/** Default when `returnTo` is missing or invalid. */
export const DEFAULT_INVOICES_LIST_PATH = "/invoices"

/**
 * Only allow same-origin relative paths (open redirect safe).
 */
export function parseSafeReturnTo(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null
  try {
    const decoded = decodeURIComponent(raw.trim())
    if (!decoded.startsWith("/")) return null
    if (decoded.startsWith("//")) return null
    if (decoded.includes("://")) return null
    const lower = decoded.toLowerCase()
    if (lower.includes("javascript:") || lower.includes("\\")) return null
    return decoded
  } catch {
    return null
  }
}

export function invoiceBackHref(searchParams: ReadonlyURLSearchParams | URLSearchParams): string {
  return parseSafeReturnTo(searchParams.get("returnTo")) ?? DEFAULT_INVOICES_LIST_PATH
}

/** Current path + query for use as `returnTo` on the next navigation. */
export function currentLocationPath(pathname: string, searchParams: ReadonlyURLSearchParams | URLSearchParams): string {
  const q = searchParams.toString()
  return q ? `${pathname}?${q}` : pathname
}

/** Append `returnTo` to an internal href (handles existing query string). */
export function withReturnTo(targetPath: string, returnToPath: string): string {
  const sep = targetPath.includes("?") ? "&" : "?"
  return `${targetPath}${sep}returnTo=${encodeURIComponent(returnToPath)}`
}

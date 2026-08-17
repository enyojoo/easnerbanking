/** Typed public id for Payment Links when the business has no @easetag. */
export const PAYMENT_LINK_PUBLIC_ID_PREFIX = "plink_"

const PUBLIC_ID_HEX_LENGTH = 32

export function toPaymentLinkPublicId(uuid: string): string {
  const hex = uuid.replace(/-/g, "").toLowerCase()
  if (hex.length !== PUBLIC_ID_HEX_LENGTH) {
    throw new Error("payment link public id requires a UUID")
  }
  return `${PAYMENT_LINK_PUBLIC_ID_PREFIX}${hex}`
}

export function isPaymentLinkPublicId(segment: string): boolean {
  return (
    segment.startsWith(PAYMENT_LINK_PUBLIC_ID_PREFIX) &&
    segment.length === PAYMENT_LINK_PUBLIC_ID_PREFIX.length + PUBLIC_ID_HEX_LENGTH &&
    /^[0-9a-f]+$/i.test(segment.slice(PAYMENT_LINK_PUBLIC_ID_PREFIX.length))
  )
}

/** Parse `plink_…` back to a canonical UUID, or null if the segment is not a payment link id. */
export function paymentLinkPublicIdToUuid(publicId: string): string | null {
  if (!isPaymentLinkPublicId(publicId)) return null
  const hex = publicId.slice(PAYMENT_LINK_PUBLIC_ID_PREFIX.length).toLowerCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** UUID v4 shape — stablecoin terminal sessions on pay.easner.com (no plink_ prefix). */
export const TERMINAL_SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isTerminalSessionId(segment: string): boolean {
  return TERMINAL_SESSION_ID_RE.test(segment)
}

/**
 * Resolve a single pay.easner.com path segment (no @easetag).
 * plink_* → payment link; UUID → terminal session; else → slug lookup (future).
 */
export function classifyPayEasnerSingleSegment(segment: string): "payment_link" | "terminal_session" | "unknown" {
  if (isPaymentLinkPublicId(segment)) return "payment_link"
  if (isTerminalSessionId(segment)) return "terminal_session"
  return "unknown"
}

import { normalizeEasetag } from "@/lib/easetag-validation"
import { getPayAppPublicOrigin } from "@/lib/customer-hosts"
import { toPaymentLinkPublicId } from "./public-id"

/**
 * Customer URLs on pay.easner.com. Two-segment form when the business has an
 * @easetag; otherwise the typed `plink_` public id keeps one-segment URLs
 * unambiguous against stablecoin session ids.
 */
export function buildPaymentLinkUrl(
  easetag: string | null | undefined,
  link: { id: string; slug: string },
): string {
  const origin = getPayAppPublicOrigin()
  const tag = easetag?.trim() ? normalizeEasetag(easetag.trim()) : ""
  if (tag) {
    return `${origin}/${encodeURIComponent(tag)}/${encodeURIComponent(link.slug)}`
  }
  return `${origin}/${toPaymentLinkPublicId(link.id)}`
}

/** Stablecoin charge session — same host, same easetag-optional shape. */
export function buildStablecoinChargeUrl(
  easetag: string | null | undefined,
  sessionId: string,
): string {
  const origin = getPayAppPublicOrigin()
  const tag = easetag?.trim() ? normalizeEasetag(easetag.trim()) : ""
  if (tag) {
    return `${origin}/${encodeURIComponent(tag)}/${encodeURIComponent(sessionId)}`
  }
  return `${origin}/${encodeURIComponent(sessionId)}`
}

/** Built-in thank-you page used when a link has no merchant redirect. */
export function buildPaymentThanksUrl(): string {
  return `${getPayAppPublicOrigin()}/thanks`
}

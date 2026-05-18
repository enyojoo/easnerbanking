/**
 * Transform Noah `HostedURL` for embedding in an iframe (business KYB dialog, legacy WebViews).
 * Checkout sessions use `checkout.noah.com/kyc?session=…`; legacy Sumsub-style links use `/verify`.
 */
export function buildNoahHostedIframeUrl(link: string, iframeOrigin: string): string {
  try {
    const url = new URL(link)
    const host = url.hostname.toLowerCase()
    if (!host.includes("noah.com")) return link

    if (url.pathname.includes("/verify")) {
      url.pathname = url.pathname.replace("/verify", "/widget")
    }

    const origin = iframeOrigin.trim()
    if (origin && !url.searchParams.has("iframe-origin")) {
      url.searchParams.set("iframe-origin", origin)
    }

    return url.toString()
  } catch {
    return link
  }
}

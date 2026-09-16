import { isMobileDeepLinkHost } from "@easner/shared"

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

/**
 * SES Virtual Deliverability Manager / click tracking rewrites hrefs onto
 * `*.awstrack.me`. iOS Universal Links and Android App Links only match
 * `app.easner.com`, so those wrapped URLs open Safari/Chrome instead of the app.
 *
 * `ses:no-track` tells SES to leave the href unchanged (attribute is stripped
 * before delivery). See https://docs.aws.amazon.com/ses/latest/dg/faqs-metrics.html
 */
export function shouldSkipSesClickTracking(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && isMobileDeepLinkHost(parsed.hostname)
  } catch {
    return false
  }
}

export function emailAnchorOpenTag(url: string, extraAttrs = ""): string {
  const skip = shouldSkipSesClickTracking(url) ? " ses:no-track" : ""
  const extra = extraAttrs.trim() ? ` ${extraAttrs.trim()}` : ""
  return `<a${skip} href="${escapeHtmlAttr(url)}"${extra}>`
}

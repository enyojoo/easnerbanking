export const APP_URLS = {
  website: "https://www.easner.com",
  app: "https://app.easner.com",
  /** Canonical marketing install page (QR, email, smart redirect). */
  appDownload: "https://www.easner.com/app",
} as const

/** HTTPS hosts that open Easner Mobile for `/user/*` paths (legacy apex included during migration). */
export const MOBILE_DEEP_LINK_HOSTS = ["app.easner.com", "easner.com"] as const

export type MobileDeepLinkHost = (typeof MOBILE_DEEP_LINK_HOSTS)[number]

export function isMobileDeepLinkHost(host: string): host is MobileDeepLinkHost {
  return (MOBILE_DEEP_LINK_HOSTS as readonly string[]).includes(host)
}

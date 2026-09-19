export const APP_URLS = {
  website: "https://www.easner.com",
  app: "https://app.easner.com",
  api: "https://api.easner.com",
  business: "https://business.easner.com",
  platform: "https://platform.easner.com",
  pay: "https://pay.easner.com",
  invoice: "https://invoice.easner.com",
  office: "https://bk.easner.com",
  contact: "https://www.easner.com/contact",
  /** Public developer docs — browser visits to api.* / js.* land here. */
  developers: "https://www.easner.com/developers",
  /** Canonical marketing install page (QR, email, smart redirect). */
  appDownload: "https://www.easner.com/app",
} as const

export const LOCAL_URLS = {
  business: "http://localhost:3000",
  office: "http://localhost:3001",
  api: "http://localhost:3002",
  expo: "http://localhost:8081",
} as const

export function resolveApiUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    process.env.OFFICE_BACKEND_API_URL ||
    process.env.API_URL
  if (fromEnv) return fromEnv.replace(/\/+$/, "")
  return process.env.NODE_ENV === "production" ? APP_URLS.api : LOCAL_URLS.api
}

export function joinApiPath(path: string, base = resolveApiUrl()): string {
  if (path.startsWith("http")) return path
  const p = path.startsWith("/") ? path : `/${path}`
  return `${base.replace(/\/+$/, "")}${p}`
}

/** HTTPS hosts that open Easner Mobile for `/user/*` paths (legacy apex included during migration). */
export const MOBILE_DEEP_LINK_HOSTS = ["app.easner.com", "easner.com"] as const

export type MobileDeepLinkHost = (typeof MOBILE_DEEP_LINK_HOSTS)[number]

export function isMobileDeepLinkHost(host: string): host is MobileDeepLinkHost {
  return (MOBILE_DEEP_LINK_HOSTS as readonly string[]).includes(host)
}

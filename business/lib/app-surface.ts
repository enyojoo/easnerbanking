import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"

export type ProductSurface = "business" | "platform"

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "")
}

function surfaceFromEnv(): ProductSurface | null {
  const env = process.env.NEXT_PUBLIC_APP_SURFACE?.trim().toLowerCase()
  if (env === "platform" || env === "business") return env
  return null
}

/**
 * Sync surface for SSR and first paint. Env only — do not read `window` here
 * or platform.easner.com hydrates as business then platform (React #418).
 */
export function getAppSurface(): ProductSurface {
  return surfaceFromEnv() ?? "business"
}

/** Env, then hostname (for the Platform host when env is unset). */
export function getAppSurfaceFromHostname(hostname: string | null | undefined): ProductSurface {
  const fromEnv = surfaceFromEnv()
  if (fromEnv) return fromEnv
  const host = (hostname ?? "").toLowerCase()
  if (host === "platform.easner.com" || host.startsWith("platform.")) return "platform"
  return "business"
}

/** Surface for event handlers / prefetch after mount. */
export function getClientAppSurface(): ProductSurface {
  if (typeof window !== "undefined") {
    return getAppSurfaceFromHostname(window.location.hostname)
  }
  return getAppSurface()
}

export function getBusinessAppUrl(): string {
  return getBusinessAppPublicOrigin()
}

/**
 * Platform origin. Unset env keeps the current origin so Phase 1b does not
 * send operators to `platform.easner.com` before that host exists.
 */
export function getPlatformAppUrl(): string {
  const env = process.env.NEXT_PUBLIC_PLATFORM_APP_URL?.trim()
  if (env) return stripTrailingSlash(env)
  if (typeof window !== "undefined") return window.location.origin
  return getBusinessAppPublicOrigin()
}

/** True when Business and Platform are on different origins (Phase 3+). */
export function isProductHostSplit(): boolean {
  const explicit = process.env.NEXT_PUBLIC_PLATFORM_APP_URL?.trim()
  if (!explicit) return false
  if (typeof window === "undefined") return true
  return stripTrailingSlash(explicit) !== window.location.origin
}

export function getProductSwitchUrl(target: ProductSurface, path = "/"): string {
  const origin = target === "platform" ? getPlatformAppUrl() : getBusinessAppUrl()
  const normalized = path.startsWith("/") ? path : `/${path}`
  return `${origin}${normalized}`
}

export function isPlatformOnlyPath(pathname: string): boolean {
  return (
    pathname === "/checkout" ||
    pathname.startsWith("/checkout/") ||
    pathname === "/developers" ||
    pathname.startsWith("/developers/") ||
    pathname === "/customers" ||
    pathname.startsWith("/customers/")
  )
}

export function isBankingOnlyPath(pathname: string): boolean {
  const roots = ["/send", "/cards", "/payroll", "/invoices", "/links", "/terminal", "/accounts"]
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}

/** Warm the destination document before the operator clicks Switch. */
export function prefetchProductOrigin(url: string): void {
  if (typeof document === "undefined") return
  const id = `easner-product-prefetch:${url}`
  if (document.getElementById(id)) return
  const link = document.createElement("link")
  link.id = id
  link.rel = "prefetch"
  link.href = url
  document.head.appendChild(link)
}

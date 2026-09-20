import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"
import {
  parseAppSurfaceCookieValue,
  readAppSurfaceCookieFromDocument,
} from "@/lib/app-surface-cookie"

export type ProductSurface = "business" | "platform"

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "")
}

function surfaceFromEnv(): ProductSurface | null {
  const env = process.env.NEXT_PUBLIC_APP_SURFACE?.trim().toLowerCase()
  if (env === "platform" || env === "business") return env
  return null
}

export function isPlatformHostname(hostname: string | null | undefined): boolean {
  const host = (hostname ?? "").toLowerCase()
  return host === "platform.easner.com" || host.startsWith("platform.")
}

/** Env or `platform.*` host — do not clear a stored cookie in those cases. */
export function isForcedPlatformSurface(hostname?: string | null): boolean {
  return surfaceFromEnv() === "platform" || isPlatformHostname(hostname)
}

export function resolveAppSurface(input: {
  hostname?: string | null
  cookie?: ProductSurface | string | null
}): ProductSurface {
  const fromEnv = surfaceFromEnv()
  if (fromEnv) return fromEnv
  if (isPlatformHostname(input.hostname)) return "platform"
  if (input.cookie == null || input.cookie === "") return "business"
  if (input.cookie === "platform" || input.cookie === "business") return input.cookie
  return parseAppSurfaceCookieValue(input.cookie)
}

/**
 * Sync surface for SSR and first paint. Env only — do not read `window` here
 * or platform.easner.com hydrates as business then platform (React #418).
 */
export function getAppSurface(): ProductSurface {
  return surfaceFromEnv() ?? "business"
}

/** Env, then hostname, then cookie (for the Platform host when env is unset). */
export function getAppSurfaceFromHostname(
  hostname: string | null | undefined,
  cookie?: string | null,
): ProductSurface {
  return resolveAppSurface({ hostname, cookie })
}

/** Surface for event handlers / prefetch after mount. */
export function getClientAppSurface(): ProductSurface {
  if (typeof window !== "undefined") {
    return resolveAppSurface({
      hostname: window.location.hostname,
      cookie:
        typeof document === "undefined" ? null : readAppSurfaceCookieFromDocument(document.cookie),
    })
  }
  return getAppSurface()
}

export function getBusinessAppUrl(): string {
  return getBusinessAppPublicOrigin()
}

/**
 * Platform origin. Unset env keeps the current origin so a future host split
 * does not send operators to `platform.easner.com` before that host exists.
 */
export function getPlatformAppUrl(): string {
  const env = process.env.NEXT_PUBLIC_PLATFORM_APP_URL?.trim()
  if (env) return stripTrailingSlash(env)
  if (typeof window !== "undefined") return window.location.origin
  return getBusinessAppPublicOrigin()
}

/** True when Business and Platform are on different origins (future host). */
export function isProductHostSplit(): boolean {
  const explicit = process.env.NEXT_PUBLIC_PLATFORM_APP_URL?.trim()
  if (!explicit) return false
  if (typeof window === "undefined") return true
  return stripTrailingSlash(explicit) !== window.location.origin
}

export function getProductSwitchPath(target: ProductSurface): string {
  return target === "platform" ? "/console" : "/dashboard"
}

/** Home for the stored mode. Login and `/` use this so Dev does not open as Banking. */
export function getWorkspaceHomePath(): string {
  return getProductSwitchPath(getClientAppSurface())
}

export function getProductSwitchUrl(target: ProductSurface, path?: string): string {
  const dest = path ?? getProductSwitchPath(target)
  const normalized = dest.startsWith("/") ? dest : `/${dest}`
  if (!isProductHostSplit()) return normalized
  const origin = target === "platform" ? getPlatformAppUrl() : getBusinessAppUrl()
  return `${origin}${normalized}`
}

export function isPlatformOnlyPath(pathname: string): boolean {
  return (
    pathname === "/console" ||
    pathname.startsWith("/console/") ||
    pathname === "/checkout" ||
    pathname.startsWith("/checkout/") ||
    pathname === "/customers" ||
    pathname.startsWith("/customers/")
  )
}

export function isBankingOnlyPath(pathname: string): boolean {
  const roots = ["/send", "/cards", "/payroll", "/invoices", "/links", "/terminal"]
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}

/** Warm the destination document before the operator clicks Switch (split hosts). */
export function prefetchProductOrigin(url: string): void {
  if (typeof document === "undefined") return
  if (!url.startsWith("http")) return
  const id = `easner-product-prefetch:${url}`
  if (document.getElementById(id)) return
  const link = document.createElement("link")
  link.id = id
  link.rel = "prefetch"
  link.href = url
  document.head.appendChild(link)
}

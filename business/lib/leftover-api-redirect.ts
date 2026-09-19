import { joinApiPath } from "@easner/shared"
import { isApiOnlyHostname, isJsCheckoutHostname } from "@/lib/api-subdomain-redirect"

function normalizeHost(value: string | undefined): string | null {
  if (!value) return null
  const h = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0]
  return h || null
}

/** True when a leftover 308/307 back to the API origin would bounce off this same request. */
export function leftoverRedirectWouldLoop(
  destOrigin: string,
  requestUrl: string,
  hostnameCandidates: string[] = [],
): boolean {
  let destHost = ""
  try {
    destHost = new URL(destOrigin).hostname.toLowerCase()
    if (destHost && destHost === new URL(requestUrl).hostname.toLowerCase()) return true
  } catch {
    return true
  }
  return hostnameCandidates.some((raw) => {
    const host = normalizeHost(raw)
    if (!host) return false
    return host === destHost || isApiOnlyHostname(host) || isJsCheckoutHostname(host)
  })
}

/** Leftover `/api/*` on a UI host → API origin. Null if that would loop. */
export function leftoverApiRedirectUrl(
  requestUrl: string,
  path: string[] | undefined,
  hostnameCandidates: string[] = [],
): URL | null {
  const suffix = (path || []).join("/")
  const dest = new URL(joinApiPath(suffix ? `/api/${suffix}` : "/api"))
  dest.search = new URL(requestUrl).search
  if (leftoverRedirectWouldLoop(dest.origin, requestUrl, hostnameCandidates)) return null
  return dest
}

/** Leftover `/checkout.js` on a UI host → API origin. Null if that would loop. */
export function leftoverCheckoutJsRedirectUrl(
  requestUrl: string,
  hostnameCandidates: string[] = [],
): URL | null {
  const dest = new URL(joinApiPath("/checkout.js"))
  dest.search = new URL(requestUrl).search
  if (leftoverRedirectWouldLoop(dest.origin, requestUrl, hostnameCandidates)) return null
  return dest
}

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { collectHostnameCandidates } from "@/lib/api-subdomain-redirect"

const DEFAULT_SDK_HOST = "js.easner.com"

/**
 * Hostnames that serve only the checkout SDK (`https://js.easner.com/checkout.js`).
 * - `EASNER_JS_HOSTS` – comma-separated overrides/additions (staging etc.)
 */
export function getSdkHostnames(): string[] {
  const list =
    process.env.EASNER_JS_HOSTS?.split(",")
      .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "")
      .filter(Boolean) ?? []
  return [...new Set([...list, DEFAULT_SDK_HOST])]
}

export function isSdkHostname(hostname: string): boolean {
  if (!hostname) return false
  return getSdkHostnames().includes(hostname.toLowerCase())
}

/** Paths the SDK host serves; everything else on that host has no business there. */
const SDK_PATH_REWRITES: Record<string, string> = {
  "/checkout.js": "/checkout.js",
  "/v1/checkout.js": "/checkout.js",
}

/**
 * `js.easner.com` shares this app: the SDK paths rewrite to the script route,
 * anything else is turned away with 404 (no redirect – this host is for scripts,
 * not people, and following unknown paths would make it an open proxy surface).
 */
export function maybeHandleSdkHost(request: NextRequest): NextResponse | null {
  const host = collectHostnameCandidates(request).find((h) => isSdkHostname(h))
  if (!host) return null

  const pathname = request.nextUrl.pathname
  const target = SDK_PATH_REWRITES[pathname]
  if (target) {
    if (target === pathname) return null // already the right internal path
    const url = request.nextUrl.clone()
    url.pathname = target
    return NextResponse.rewrite(url)
  }
  if (pathname.startsWith("/_next")) return null
  return new NextResponse("Not found", { status: 404 }) as NextResponse
}

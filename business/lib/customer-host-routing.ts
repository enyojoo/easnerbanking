import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { APP_URLS } from "@easner/shared"
import { getInvoiceAppHostname, getPayAppHostname, isCustomerAppHostname } from "@/lib/customer-hosts"
import { collectHostnameCandidates } from "@/lib/api-subdomain-redirect"

/** Route trees that back each customer host inside this app. */
const CUSTOMER_HOST_ROOTS = {
  invoice: "/invoice",
  pay: "/pay-customer",
} as const

function isInternalPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/checkout.js" ||
    pathname.startsWith("/v1/") ||
    /^\/v[\d.]+\/checkout\.js$/.test(pathname) ||
    pathname === "/og" ||
    pathname.startsWith("/og/")
  )
}

function isCustomerPublicHostname(hostname: string): boolean {
  return isCustomerAppHostname(hostname)
}

/**
 * Prefer invoice/pay hosts when proxies list several (Vercel `Host` can be the
 * deployment URL while `x-forwarded-host` is pay.easner.com).
 */
export function getCustomerRequestHostname(request: NextRequest): string {
  const candidates = collectHostnameCandidates(request)
  const customer = candidates.find((host) => isCustomerAppHostname(host))
  return customer ?? candidates[0] ?? ""
}

/**
 * Bare `invoice.easner.com/` and `pay.easner.com/` are not customer pages.
 * Send browsers to the marketing business page; keep payer paths on these hosts.
 */
export function maybeRedirectCustomerHostRootToMarketing(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname
  if (pathname !== "/") return null

  const hostname = getCustomerRequestHostname(request)
  if (!hostname || !isCustomerPublicHostname(hostname)) return null

  const res = NextResponse.redirect(APP_URLS.businessMarketing, 307)
  res.headers.set("Cache-Control", "private, no-store")
  return res
}

/**
 * Serve invoice.easner.com and pay.easner.com from this app by rewriting each host
 * onto its own route tree, so `invoice.easner.com/acme/einv-1042` renders
 * `/invoice/acme/einv-1042` without the customer ever seeing the internal path.
 */
export function maybeRewriteCustomerHost(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname
  if (pathname === "/" || isInternalPath(pathname)) return null

  const hostname = getCustomerRequestHostname(request)
  if (!hostname) return null

  const root =
    hostname === getInvoiceAppHostname()
      ? CUSTOMER_HOST_ROOTS.invoice
      : hostname === getPayAppHostname()
        ? CUSTOMER_HOST_ROOTS.pay
        : null
  if (!root) return null
  if (pathname === root || pathname.startsWith(`${root}/`)) return null

  const url = request.nextUrl.clone()
  url.pathname = `${root}${pathname}`
  return NextResponse.rewrite(url)
}

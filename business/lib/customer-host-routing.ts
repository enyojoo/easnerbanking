import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getInvoiceAppHostname, getPayAppHostname } from "@/lib/customer-hosts"
import { getRequestHostname } from "@/lib/api-subdomain-redirect"

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
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/checkout.js"
  )
}

/**
 * Serve invoice.easner.com and pay.easner.com from this app by rewriting each host
 * onto its own route tree, so `invoice.easner.com/acme/einv-1042` renders
 * `/invoice/acme/einv-1042` without the customer ever seeing the internal path.
 */
export function maybeRewriteCustomerHost(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname
  if (isInternalPath(pathname)) return null

  const hostname = getRequestHostname(request)
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
  url.pathname = pathname === "/" ? root : `${root}${pathname}`
  return NextResponse.rewrite(url)
}

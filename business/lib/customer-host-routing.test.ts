import { describe, expect, it } from "vitest"
import type { NextRequest } from "next/server"
import {
  maybeRedirectCustomerHostRootToBusiness,
  maybeRewriteCustomerHost,
} from "./customer-host-routing"

function request(host: string, pathname: string): NextRequest {
  const url = new URL(`https://${host}${pathname}`)
  return {
    nextUrl: { pathname, hostname: host, clone: () => new URL(url.toString()) },
    headers: new Headers({ host }),
  } as unknown as NextRequest
}

function rewrittenPath(host: string, pathname: string): string | null {
  const response = maybeRewriteCustomerHost(request(host, pathname))
  const destination = response?.headers.get("x-middleware-rewrite")
  return destination ? new URL(destination).pathname : null
}

function redirectLocation(host: string, pathname: string): string | null {
  return maybeRedirectCustomerHostRootToBusiness(request(host, pathname))?.headers.get("location") ?? null
}

describe("customer host routing", () => {
  it("serves invoice.easner.com from the /invoice route tree", () => {
    expect(rewrittenPath("invoice.easner.com", "/acme/einv-1042")).toBe("/invoice/acme/einv-1042")
  })

  it("serves pay.easner.com from the /pay-customer route tree", () => {
    expect(rewrittenPath("pay.easner.com", "/acme/tuition-fall")).toBe(
      "/pay-customer/acme/tuition-fall",
    )
    expect(rewrittenPath("pay.easner.com", "/thanks")).toBe("/pay-customer/thanks")
  })

  it("redirects only the customer-host root to the business app", () => {
    expect(redirectLocation("invoice.easner.com", "/")).toBe("https://business.easner.com/")
    expect(redirectLocation("pay.easner.com", "/")).toBe("https://business.easner.com/")
    expect(redirectLocation("invoice.easner.com", "/acme/einv-1042")).toBeNull()
    expect(redirectLocation("pay.easner.com", "/thanks")).toBeNull()
    expect(redirectLocation("business.easner.com", "/")).toBeNull()
    expect(rewrittenPath("pay.easner.com", "/")).toBeNull()
    expect(rewrittenPath("invoice.easner.com", "/")).toBeNull()
  })

  it("leaves the operator dashboard host alone", () => {
    expect(rewrittenPath("business.easner.com", "/links")).toBeNull()
  })

  it("does not rewrite API routes, assets, or the embed script", () => {
    expect(rewrittenPath("pay.easner.com", "/api/payment-links/public/acme/tuition-fall")).toBeNull()
    expect(rewrittenPath("pay.easner.com", "/_next/static/chunk.js")).toBeNull()
    expect(rewrittenPath("invoice.easner.com", "/checkout.js")).toBeNull()
  })

  it("is idempotent when the path already points at the route tree", () => {
    expect(rewrittenPath("invoice.easner.com", "/invoice/acme/einv-1042")).toBeNull()
    expect(rewrittenPath("pay.easner.com", "/pay-customer/thanks")).toBeNull()
  })
})

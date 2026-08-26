import { describe, expect, it } from "vitest"
import type { NextRequest } from "next/server"
import {
  isCheckoutJsPath,
  isPublicCheckoutApiPath,
  maybeRedirectApiHostToBusiness,
  maybeRewriteApiV1ToAppApi,
  maybeRewriteJsCheckoutScript,
} from "./api-subdomain-redirect"

function request(host: string, pathname: string): NextRequest {
  const url = new URL(`https://${host}${pathname}`)
  return {
    nextUrl: {
      pathname,
      hostname: host,
      search: "",
      clone: () => {
        const cloned = new URL(url.toString())
        return cloned
      },
    },
    headers: new Headers({ host }),
  } as unknown as NextRequest
}

function rewrittenPath(host: string, pathname: string): string | null {
  const response =
    maybeRewriteApiV1ToAppApi(request(host, pathname)) ??
    maybeRewriteJsCheckoutScript(request(host, pathname))
  const destination = response?.headers.get("x-middleware-rewrite")
  return destination ? new URL(destination).pathname : null
}

describe("checkout edge routing", () => {
  it("recognises public v1 and checkout.js paths", () => {
    expect(isPublicCheckoutApiPath("/v1/checkout/sessions")).toBe(true)
    expect(isPublicCheckoutApiPath("/api/v1/checkout/sessions")).toBe(false)
    expect(isCheckoutJsPath("/checkout.js")).toBe(true)
    expect(isCheckoutJsPath("/v1/checkout.js")).toBe(true)
    expect(isCheckoutJsPath("/v1.0.0/checkout.js")).toBe(true)
    expect(isCheckoutJsPath("/v1/other.js")).toBe(false)
  })

  it("rewrites /v1 onto /api/v1 on any host", () => {
    expect(rewrittenPath("api.easner.com", "/v1/checkout/sessions")).toBe(
      "/api/v1/checkout/sessions",
    )
    expect(rewrittenPath("business.easner.com", "/v1/checkout/publishable-keys/validate")).toBe(
      "/api/v1/checkout/publishable-keys/validate",
    )
    expect(maybeRedirectApiHostToBusiness(request("api.easner.com", "/v1/checkout/sessions"))).toBeNull()
  })

  it("rewrites versioned scripts onto /checkout.js on any host", () => {
    expect(rewrittenPath("js.easner.com", "/v1/checkout.js")).toBe("/checkout.js")
    expect(rewrittenPath("business.easner.com", "/v1/checkout.js")).toBe("/checkout.js")
    expect(rewrittenPath("js.easner.com", "/v1.0.0/checkout.js")).toBe("/checkout.js")
    expect(rewrittenPath("js.easner.com", "/checkout.js")).toBeNull()
  })

  it("still redirects non-API browser paths on the API host", () => {
    expect(
      maybeRedirectApiHostToBusiness(request("api.easner.com", "/checkout"))?.headers.get(
        "location",
      ),
    ).toBe("https://business.easner.com/checkout")
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { leftoverApiRedirectUrl, leftoverCheckoutJsRedirectUrl } from "./leftover-api-redirect"

describe("leftoverApiRedirectUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("points leftover /api paths at the API origin", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.easner.com")
    const dest = leftoverApiRedirectUrl(
      "https://business.easner.com/api/business/profile?x=1",
      ["business", "profile"],
    )
    expect(dest?.href).toBe("https://api.easner.com/api/business/profile?x=1")
  })

  it("returns null when the request already arrived on the API or js host", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.easner.com")
    expect(
      leftoverApiRedirectUrl("https://easnerbank.vercel.app/api/health", ["health"], [
        "easnerbank.vercel.app",
        "api.easner.com",
      ]),
    ).toBeNull()
    expect(
      leftoverApiRedirectUrl("https://easnerbank.vercel.app/api/health", ["health"], [
        "js.easner.com",
      ]),
    ).toBeNull()
  })

  it("does not bounce leftover checkout.js when the request is already on api or js", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.easner.com")
    expect(
      leftoverCheckoutJsRedirectUrl("https://easnerbank.vercel.app/checkout.js", [
        "js.easner.com",
      ]),
    ).toBeNull()
    expect(
      leftoverCheckoutJsRedirectUrl("https://business.easner.com/checkout.js")?.href,
    ).toBe("https://api.easner.com/checkout.js")
  })

  it("returns null when the API origin is this host", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://business.easner.com")
    expect(
      leftoverApiRedirectUrl("https://business.easner.com/api/health", ["health"]),
    ).toBeNull()
  })
})

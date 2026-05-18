import { describe, expect, it } from "vitest"
import { buildNoahHostedIframeUrl } from "./hosted-iframe-url"

describe("buildNoahHostedIframeUrl", () => {
  it("adds iframe-origin to checkout.noah.com kyc sessions", () => {
    const out = buildNoahHostedIframeUrl(
      "https://checkout.noah.com/kyc?session=abc",
      "https://business.easner.com",
    )
    const parsed = new URL(out)
    expect(parsed.searchParams.get("iframe-origin")).toBe("https://business.easner.com")
  })

  it("rewrites legacy /verify paths to /widget", () => {
    const out = buildNoahHostedIframeUrl(
      "https://api.sandbox.noah.com/verify?token=x",
      "https://business.easner.com",
    )
    expect(out).toContain("/widget")
    expect(out).not.toContain("/verify")
  })

  it("does not duplicate iframe-origin", () => {
    const out = buildNoahHostedIframeUrl(
      "https://checkout.noah.com/kyc?session=abc&iframe-origin=https%3A%2F%2Fexisting.com",
      "https://business.easner.com",
    )
    expect(out).toContain("iframe-origin=https%3A%2F%2Fexisting.com")
    expect(out.match(/iframe-origin=/g)?.length).toBe(1)
  })

  it("returns non-Noah links unchanged", () => {
    const link = "https://example.com/onboarding"
    expect(buildNoahHostedIframeUrl(link, "https://business.easner.com")).toBe(link)
  })
})

import { describe, expect, it } from "vitest"
import {
  buildBridgeHostedIframeUrl,
  isBridgeHostedMessageOrigin,
  isHostedVerificationCompleteMessage,
} from "./hosted-iframe-url"

describe("buildBridgeHostedIframeUrl", () => {
  it("rewrites Persona /verify to /widget and adds iframe-origin", () => {
    const out = buildBridgeHostedIframeUrl(
      "https://bridge.withpersona.com/verify?inquiry-template-id=tpl&fields[iqt_token]=tok",
      "https://business.easner.com",
    )
    const parsed = new URL(out)
    expect(parsed.pathname).toBe("/widget")
    expect(parsed.searchParams.get("iframe-origin")).toBe("https://business.easner.com")
    expect(parsed.searchParams.get("inquiry-template-id")).toBe("tpl")
  })

  it("does not duplicate iframe-origin", () => {
    const out = buildBridgeHostedIframeUrl(
      "https://bridge.withpersona.com/widget?iframe-origin=https%3A%2F%2Fexisting.com",
      "https://business.easner.com",
    )
    expect(out).toContain("iframe-origin=https%3A%2F%2Fexisting.com")
    expect(out.match(/iframe-origin=/g)?.length).toBe(1)
  })

  it("leaves non-verify paths intact aside from iframe-origin", () => {
    const out = buildBridgeHostedIframeUrl(
      "https://dashboard.bridge.xyz/accept-terms?session=abc",
      "https://business.easner.com",
    )
    const parsed = new URL(out)
    expect(parsed.pathname).toBe("/accept-terms")
    expect(parsed.searchParams.get("iframe-origin")).toBe("https://business.easner.com")
  })

  it("returns unparseable links unchanged", () => {
    expect(buildBridgeHostedIframeUrl("not a url", "https://business.easner.com")).toBe("not a url")
  })
})

describe("isHostedVerificationCompleteMessage", () => {
  it("accepts the shared onboarding-complete payload", () => {
    expect(
      isHostedVerificationCompleteMessage({
        type: "kycCompleted",
        hostedComplete: true,
        kycCompleted: true,
      }),
    ).toBe(true)
  })

  it("accepts Persona complete events", () => {
    expect(isHostedVerificationCompleteMessage({ name: "complete" })).toBe(true)
    expect(isHostedVerificationCompleteMessage({ event: "inquiry-complete" })).toBe(true)
  })

  it("ignores ready / start noise", () => {
    expect(isHostedVerificationCompleteMessage({ name: "ready" })).toBe(false)
    expect(isHostedVerificationCompleteMessage(null)).toBe(false)
  })
})

describe("isBridgeHostedMessageOrigin", () => {
  it("allows the app origin and Persona hosts", () => {
    expect(isBridgeHostedMessageOrigin("https://business.easner.com", "https://business.easner.com")).toBe(true)
    expect(isBridgeHostedMessageOrigin("https://bridge.withpersona.com", "https://business.easner.com")).toBe(true)
    expect(isBridgeHostedMessageOrigin("https://evil.example", "https://business.easner.com")).toBe(false)
  })
})

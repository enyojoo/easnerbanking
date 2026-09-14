import { describe, expect, it } from "vitest"
import {
  buildBridgeHostedIframeUrl,
  isBridgeHostedMessageOrigin,
  isBridgeTosAcceptedMessage,
  isHostedVerificationCompleteMessage,
  signedAgreementIdFromUnknown,
  signedAgreementIdFromUrl,
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

  it("leaves TOS URLs untouched so Accept can redirect", () => {
    const href = "https://dashboard.bridge.xyz/accept-terms?session=abc"
    expect(buildBridgeHostedIframeUrl(href, "https://business.easner.com")).toBe(href)
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

  it("does not treat TOS acceptance as KYC complete", () => {
    expect(isBridgeTosAcceptedMessage({ type: "bridgeTosAccepted" })).toBe(true)
    expect(isBridgeTosAcceptedMessage({ signedAgreementId: "agr_1" })).toBe(true)
    expect(isHostedVerificationCompleteMessage({ type: "bridgeTosAccepted" })).toBe(false)
  })

  it("reads signed_agreement_id from TOS return and postMessage", () => {
    expect(
      signedAgreementIdFromUrl(
        "https://business.easner.com/auth/onboarding-complete?context=bridge-tos&signed_agreement_id=agr_1",
      ),
    ).toBe("agr_1")
    expect(signedAgreementIdFromUnknown({ signedAgreementId: "agr_2" })).toBe("agr_2")
    expect(signedAgreementIdFromUnknown({ type: "bridgeTosAccepted" })).toBeNull()
  })
})

describe("isBridgeHostedMessageOrigin", () => {
  it("allows the app origin and Persona hosts", () => {
    expect(isBridgeHostedMessageOrigin("https://business.easner.com", "https://business.easner.com")).toBe(true)
    expect(isBridgeHostedMessageOrigin("https://bridge.withpersona.com", "https://business.easner.com")).toBe(true)
    expect(isBridgeHostedMessageOrigin("https://dashboard.bridge.xyz", "https://business.easner.com")).toBe(true)
    expect(isBridgeHostedMessageOrigin("https://app.easner.com", "https://business.easner.com")).toBe(true)
    expect(isBridgeHostedMessageOrigin("https://evil.example", "https://business.easner.com")).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { pickBridgeKycLinkFullName, bridgeCreateKycLinkIdempotencyKey } from "./kyc-links"

describe("pickBridgeKycLinkFullName", () => {
  it("sends the org legal name for business KYB, not the owner", () => {
    expect(
      pickBridgeKycLinkFullName({
        type: "business",
        businessLegalName: "Easner Group, Inc",
        personFullName: "Jane Owner",
      }),
    ).toBe("Easner Group, Inc")
  })

  it("does not fall back to the owner when the org name is missing", () => {
    expect(
      pickBridgeKycLinkFullName({
        type: "business",
        businessLegalName: "  ",
        personFullName: "Jane Owner",
      }),
    ).toBe("Business")
  })

  it("sends the person name for individual KYC", () => {
    expect(
      pickBridgeKycLinkFullName({
        type: "individual",
        businessLegalName: "Easner Group, Inc",
        personFullName: "Jane Owner",
      }),
    ).toBe("Jane Owner")
  })
})

describe("bridgeCreateKycLinkIdempotencyKey", () => {
  it("changes when the legal name changes so reopen does not reuse the owner-name link", () => {
    const subjectId = "biz_1"
    const ownerKey = bridgeCreateKycLinkIdempotencyKey({
      type: "business",
      subjectId,
      fullName: "Jane Owner",
    })
    const orgKey = bridgeCreateKycLinkIdempotencyKey({
      type: "business",
      subjectId,
      fullName: "Easner Group, Inc",
    })
    expect(orgKey).not.toBe(ownerKey)
    expect(orgKey).toContain("easner group, inc")
  })
})

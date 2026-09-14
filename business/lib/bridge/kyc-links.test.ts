import { describe, expect, it } from "vitest"
import { pickBridgeKycLinkFullName, bridgeCreateKycLinkIdempotencyKey, pickBridgeCustomerForEmail } from "./kyc-links"

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
  it("stays stable for an individual when the display name changes", () => {
    const subjectId = "user_1"
    expect(
      bridgeCreateKycLinkIdempotencyKey({
        type: "individual",
        subjectId,
        fullName: "Jane Owner",
      }),
    ).toBe(
      bridgeCreateKycLinkIdempotencyKey({
        type: "individual",
        subjectId,
        fullName: "jane",
      }),
    )
  })

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

describe("pickBridgeCustomerForEmail", () => {
  it("prefers an approved individual with the same email", () => {
    expect(
      pickBridgeCustomerForEmail(
        [
          {
            id: "cust_pending",
            email: "enyocreative@gmail.com",
            type: "individual",
            kyc_status: "incomplete",
          },
          {
            id: "23921f79-bef6-461a-89e3-26802bee52b6",
            email: "enyocreative@gmail.com",
            type: "individual",
            kyc_status: "approved",
          },
          {
            id: "cust_biz",
            email: "enyocreative@gmail.com",
            type: "business",
            kyc_status: "approved",
          },
        ],
        "EnyoCreative@gmail.com",
        "individual",
      )?.id,
    ).toBe("23921f79-bef6-461a-89e3-26802bee52b6")
  })
})

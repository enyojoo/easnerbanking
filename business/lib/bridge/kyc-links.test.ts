import { describe, expect, it } from "vitest"
import {
  pickBridgeKycLinkFullName,
  bridgeCreateKycLinkIdempotencyKey,
  pickBridgeCustomerForEmail,
  resolveBridgeCustomerKycStatus,
  hostedLinksForExistingCustomer,
  applyBridgeHostedRedirect,
  isBridgeTosApproved,
  shouldPrefillBridgeBusinessCustomer,
  shouldRequestSepaKycEndorsement,
  publicBridgeKycHubStatus,
  BRIDGE_KYC_LINK_ENDORSEMENTS,
  bridgeNameNeedsTransliteration,
  bridgeKycTransliterationFields,
} from "./kyc-links"

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
    ).toBe("bridge-kyc-v2:individual:user_1")
    expect(
      bridgeCreateKycLinkIdempotencyKey({
        type: "individual",
        subjectId,
        fullName: "jane",
      }),
    ).toBe("bridge-kyc-v2:individual:user_1")
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

  it("does not attach an individual customer to a business KYB email lookup", () => {
    expect(
      pickBridgeCustomerForEmail(
        [
          {
            id: "owner-individual",
            email: "owner@example.com",
            type: "individual",
            kyc_status: "approved",
          },
        ],
        "owner@example.com",
        "business",
      ),
    ).toBeNull()
  })
})

describe("resolveBridgeCustomerKycStatus", () => {
  it("does not treat platform active as KYC in progress", () => {
    expect(resolveBridgeCustomerKycStatus({ status: "active" })).toBe("not_started")
  })

  it("treats awaiting UBO as in-progress KYB", () => {
    expect(resolveBridgeCustomerKycStatus({ kyc_status: "awaiting_ubo" })).toBe("in_progress")
    expect(resolveBridgeCustomerKycStatus({ status: "awaiting_ubo" })).toBe("in_progress")
  })

  it("surfaces Continue-ready hub status when a customer exists", () => {
    expect(publicBridgeKycHubStatus({ rawStatus: "awaiting_ubo" })).toEqual({
      status: "in_progress",
      complete: false,
    })
    expect(publicBridgeKycHubStatus({ rawStatus: null, customerId: "cust_1" })).toEqual({
      status: "in_progress",
      complete: false,
    })
  })

  it("does not prefill or request SEPA once KYB has started", () => {
    expect(shouldPrefillBridgeBusinessCustomer("awaiting_ubo")).toBe(false)
    expect(shouldPrefillBridgeBusinessCustomer("not_started")).toBe(true)
    expect(shouldRequestSepaKycEndorsement({ kyc_status: "awaiting_ubo" })).toBe(false)
    expect(
      shouldRequestSepaKycEndorsement({
        kyc_status: "approved",
        endorsements: [{ name: "sepa", status: "incomplete" }],
      }),
    ).toBe(true)
  })

  it("treats approved endorsements as approved KYC", () => {
    expect(
      resolveBridgeCustomerKycStatus({
        status: "active",
        endorsements: [{ name: "base", status: "approved" }],
      }),
    ).toBe("approved")
  })
})

describe("isBridgeTosApproved", () => {
  it("treats Bridge accepted flags as done", () => {
    expect(isBridgeTosApproved({ tos_status: "approved" })).toBe(true)
    expect(isBridgeTosApproved({ has_accepted_terms_of_service: true })).toBe(true)
    expect(isBridgeTosApproved({ tos_status: "pending" })).toBe(false)
  })
})

describe("applyBridgeHostedRedirect", () => {
  it("adds redirect_uri to a Bridge TOS link that has none", () => {
    const out = applyBridgeHostedRedirect(
      "https://dashboard.bridge.xyz/accept-terms-of-service?session_token=abc",
      "https://business.easner.com/auth/onboarding-complete?context=bridge-tos",
    )
    expect(out).toContain("redirect_uri=")
    expect(out).toContain("bridge-tos")
  })

  it("overwrites a KYB complete redirect so TOS cannot close the sheet", () => {
    const out = applyBridgeHostedRedirect(
      "https://dashboard.bridge.xyz/accept-terms-of-service?redirect_uri=https%3A%2F%2Fbusiness.easner.com%2Fauth%2Fonboarding-complete%3Fcontext%3Dbusiness",
      "https://business.easner.com/auth/onboarding-complete?context=bridge-tos",
      { overwrite: true },
    )
    expect(out).toContain("bridge-tos")
    expect(out).not.toContain("context%3Dbusiness")
  })
})

describe("hostedLinksForExistingCustomer", () => {
  it("keeps TOS when it is still pending so signed_agreement_id can be attached", () => {
    expect(
      hostedLinksForExistingCustomer({
        customerId: "23921f79-bef6-461a-89e3-26802bee52b6",
        customer: { kyc_status: "incomplete", tos_status: "pending" },
        hosted: { kyc_link: "https://kyc.example", tos_link: "https://tos.example" },
      }),
    ).toEqual({
      kyc_link: "https://kyc.example",
      tos_link: "https://tos.example",
      kyc_status: "in_progress",
      customer_id: "23921f79-bef6-461a-89e3-26802bee52b6",
      alreadyOnboarded: false,
    })
  })

  it("omits TOS when we already recorded acceptance locally", () => {
    expect(
      hostedLinksForExistingCustomer({
        customerId: "23921f79-bef6-461a-89e3-26802bee52b6",
        customer: { kyc_status: "incomplete", tos_status: "pending" },
        localTosApproved: true,
        hosted: { kyc_link: "https://kyc.example", tos_link: "https://tos.example" },
      }),
    ).toMatchObject({
      kyc_link: "https://kyc.example",
      tos_link: null,
    })
  })

  it("omits TOS after it is approved", () => {
    expect(
      hostedLinksForExistingCustomer({
        customerId: "23921f79-bef6-461a-89e3-26802bee52b6",
        customer: { kyc_status: "incomplete", tos_status: "approved" },
        hosted: { kyc_link: "https://kyc.example", tos_link: "https://tos.example" },
      }),
    ).toMatchObject({
      kyc_link: "https://kyc.example",
      tos_link: null,
      alreadyOnboarded: false,
    })
  })

  it("treats approved endorsements as already onboarded even when tos_status is empty", () => {
    expect(
      hostedLinksForExistingCustomer({
        customerId: "23921f79-bef6-461a-89e3-26802bee52b6",
        customer: {
          status: "active",
          endorsements: [{ name: "sepa", status: "approved" }],
        },
        hosted: { kyc_link: "https://kyc.example", tos_link: "https://tos.example" },
      }),
    ).toMatchObject({
      kyc_link: null,
      tos_link: null,
      alreadyOnboarded: true,
      kyc_status: "approved",
    })
  })
})

describe("bridge KYC link create payload helpers", () => {
  it("requests sepa only — base is implicit and rejected on the link body", () => {
    expect(BRIDGE_KYC_LINK_ENDORSEMENTS).toEqual(["sepa"])
  })

  it("adds transliterated name parts when the legal name is outside Latin-1", () => {
    expect(bridgeNameNeedsTransliteration("Jane Owner")).toBe(false)
    expect(bridgeNameNeedsTransliteration("Kọla Adeyemi")).toBe(true)
    expect(bridgeKycTransliterationFields("Kọla Adeyemi", "individual")).toEqual({
      transliterated_first_name: "Kola",
      transliterated_last_name: "Adeyemi",
    })
  })
})

import { describe, expect, it } from "vitest"
import {
  expressDepositsAdvanceAfter,
  expressDepositsHighestVerifiedTier,
  expressDepositsNextStep,
  expressDepositsPersistStatus,
  expressDepositsStatusIsReady,
  isExpressIdentitySetupStep,
  isExpressReviewSetupStep,
  keepExpressDepositsCachedNextStep,
  keepExpressDepositsCachedReady,
  resolveExpressDepositsSetupStep,
} from "./express-deposits-next-step"

const christian = {
  cryptoCustomerId: "crc_1U74l0FtxW9Zk3ZB195VkCGT",
  customer: {
    id: "crc_1U74l0FtxW9Zk3ZB195VkCGT",
    kyc_region: "us",
    kyc_tiers: [
      { tier: "l0", verification_status: "verified" },
      { tier: "l1", verification_status: "not_started" },
      { tier: "l2", verification_status: "not_started" },
    ],
    provided_fields: [
      "first_name",
      "last_name",
      "dob",
      "address_line_1",
      "id_document",
      "selfie",
    ],
    verifications: [
      { name: "kyc_verified", status: "verified" },
      { name: "id_document_verified", status: "verified" },
    ],
  },
  payerCountry: "US",
}

describe("expressDepositsNextStep", () => {
  it("starts at link without a customer", () => {
    expect(expressDepositsNextStep({})).toBe("link")
  })

  it("keeps US on details+SSN until L1 is verified", () => {
    expect(expressDepositsNextStep(christian)).toBe("us_kyc")
    expect(expressDepositsNextStep({ ...christian, walletRegistered: true })).toBe("us_kyc")
  })

  it("does not treat deprecated id_document_verified as L2", () => {
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "us",
          kyc_tiers: [
            { tier: "l0", verification_status: "verified" },
            { tier: "l1", verification_status: "verified" },
            { tier: "l2", verification_status: "not_started" },
          ],
          verifications: [{ name: "id_document_verified", status: "verified" }],
        },
        payerCountry: "US",
        walletRegistered: true,
      }),
    ).toBe("us_l2")
  })

  it("polls while L0/L1/L2 is pending", () => {
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "us",
          kyc_tiers: [{ tier: "l1", verification_status: "pending" }],
        },
        payerCountry: "US",
      }),
    ).toBe("review")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "us",
          kyc_tiers: [
            { tier: "l1", verification_status: "verified" },
            { tier: "l2", verification_status: "pending" },
          ],
        },
        payerCountry: "US",
      }),
    ).toBe("review")
  })

  it("collects SSN when retrieve only returns the customer id", () => {
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: { id: "crc_1" },
        payerCountry: "US",
        walletRegistered: true,
      }),
    ).toBe("us_kyc")
  })

  it("requires US L1 then L2 then wallet for ready", () => {
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          kyc_region: "us",
          kyc_tiers: [{ tier: "l1", verification_status: "verified" }],
        },
        walletRegistered: true,
      }),
    ).toBe("us_l2")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          kyc_region: "us",
          kyc_tiers: [
            { tier: "l1", verification_status: "verified" },
            { tier: "l2", verification_status: "verified" },
          ],
        },
      }),
    ).toBe("wallet")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          kyc_region: "us",
          kyc_tiers: [
            { tier: "l1", verification_status: "verified" },
            { tier: "l2", verification_status: "verified" },
          ],
        },
        walletRegistered: true,
      }),
    ).toBe("ready")
  })

  it("walks EU requirements then wallet", () => {
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: { id: "crc_1", kyc_region: "eu", kyc_tiers: [{ tier: "l2", verification_status: "not_started" }] },
      }),
    ).toBe("eu_kyc")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "eu",
          kyc_tiers: [{ tier: "l0", verification_status: "verified" }],
          provided_fields: ["first_name", "last_name", "address_line_1"],
        },
      }),
    ).toBe("eu_identifiers")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "eu",
          kyc_tiers: [{ tier: "l0", verification_status: "verified" }],
          provided_fields: ["first_name", "last_name", "address_line_1", "identifiers"],
        },
      }),
    ).toBe("eu_attestation")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "eu",
          kyc_tiers: [{ tier: "l2", verification_status: "pending" }],
          provided_fields: ["first_name", "last_name", "address_line_1"],
        },
      }),
    ).toBe("eu_identifiers")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "eu",
          kyc_tiers: [{ tier: "l0", verification_status: "pending" }],
          provided_fields: ["first_name", "last_name", "address_line_1"],
        },
        payerCountry: "DE",
      }),
    ).toBe("eu_identifiers")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "eu",
          kyc_tiers: [{ tier: "l2", verification_status: "pending" }],
          provided_fields: ["identifiers", "attestation", "first_name", "last_name", "address_line_1"],
        },
        walletRegistered: true,
      }),
    ).toBe("eu_l2")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "eu",
          kyc_tiers: [{ tier: "l0", verification_status: "verified" }, { tier: "l2", verification_status: "not_started" }],
          provided_fields: ["identifiers", "attestation", "first_name", "last_name", "address_line_1"],
        },
        walletRegistered: true,
      }),
    ).toBe("eu_l2")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "eu",
          kyc_tiers: [{ tier: "l2", verification_status: "verified" }],
          provided_fields: ["identifiers", "attestation"],
        },
        walletRegistered: true,
      }),
    ).toBe("ready")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "eu",
          kyc_tiers: [{ tier: "l2", verification_status: "verified" }],
        },
        walletRegistered: true,
      }),
    ).toBe("eu_identifiers")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: { id: "crc_1", kyc_tiers: [{ tier: "l2", verification_status: "not_started" }] },
        payerCountry: "DE",
      }),
    ).toBe("eu_kyc")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: { id: "crc_1", kyc_tiers: [{ tier: "l2", verification_status: "not_started" }] },
        payerCountry: "GB",
      }),
    ).toBe("us_kyc")
  })
})

describe("isExpressIdentitySetupStep", () => {
  it("only treats L2 as identity, not the details form", () => {
    expect(isExpressIdentitySetupStep("us_l2")).toBe(true)
    expect(isExpressIdentitySetupStep("eu_l2")).toBe(true)
    expect(isExpressIdentitySetupStep("us_kyc")).toBe(false)
    expect(isExpressIdentitySetupStep("review")).toBe(false)
    expect(isExpressIdentitySetupStep("link")).toBe(false)
    expect(isExpressReviewSetupStep("review")).toBe(true)
  })
})

describe("expressDeposits persist helpers", () => {
  it("maps next step to stored status and highest verified tier", () => {
    expect(expressDepositsPersistStatus("ready")).toBe("ready")
    expect(expressDepositsPersistStatus("review")).toBe("in_review")
    expect(expressDepositsPersistStatus("us_kyc")).toBe("in_progress")
    expect(expressDepositsHighestVerifiedTier(christian.customer)).toBe("l0")
    expect(
      expressDepositsHighestVerifiedTier({
        kyc_tiers: [
          { tier: "l1", verification_status: "verified" },
          { tier: "l2", verification_status: "verified" },
        ],
      }),
    ).toBe("l2")
  })
})

describe("keepExpressDepositsCachedReady", () => {
  it("keeps a verified cache when live retrieve returns an empty customer", () => {
    expect(expressDepositsStatusIsReady({ status: "ready" })).toBe(true)
    expect(
      keepExpressDepositsCachedReady({
        cachedReady: true,
        incoming: { ready: false, status: "in_progress", cryptoCustomerId: "crc_1", kycTiers: [] },
      }),
    ).toBe(true)
    expect(
      keepExpressDepositsCachedReady({
        cachedReady: true,
        incoming: {
          ready: false,
          status: "in_progress",
          cryptoCustomerId: "crc_1",
          kycTiers: [{ tier: "l1", verification_status: "not_started" }],
        },
      }),
    ).toBe(false)
    expect(
      keepExpressDepositsCachedReady({
        cachedReady: true,
        incoming: { ready: false, eligible: false, kycTiers: [] },
      }),
    ).toBe(false)
  })
})

describe("resolveExpressDepositsSetupStep", () => {
  it("resumes KYC instead of flashing link when a customer already exists", () => {
    expect(resolveExpressDepositsSetupStep(null)).toBe("link")
    expect(resolveExpressDepositsSetupStep({ nextStep: "us_l2" })).toBe("us_l2")
    expect(resolveExpressDepositsSetupStep({ ready: true })).toBe("ready")
    expect(resolveExpressDepositsSetupStep({ cryptoCustomerId: "crc_1", payerCountry: "US" })).toBe(
      "us_kyc",
    )
    expect(resolveExpressDepositsSetupStep({ cryptoCustomerId: "crc_1", payerCountry: "DE" })).toBe(
      "eu_kyc",
    )
    expect(resolveExpressDepositsSetupStep({ cryptoCustomerId: "crc_1", payerCountry: "GB" })).toBe(
      "us_kyc",
    )
  })
})

describe("expressDepositsAdvanceAfter", () => {
  it("moves a new US user from link to details, then review", () => {
    expect(expressDepositsAdvanceAfter({ completed: "link", payerCountry: "US" })).toBe("us_kyc")
    expect(expressDepositsAdvanceAfter({ completed: "us_kyc" })).toBe("review")
    expect(expressDepositsAdvanceAfter({ completed: "us_l2" })).toBe("review")
    expect(expressDepositsAdvanceAfter({ completed: "wallet" })).toBe("ready")
  })

  it("walks EU-27 from link through identity, not review", () => {
    expect(expressDepositsAdvanceAfter({ completed: "link", payerCountry: "DE" })).toBe("eu_kyc")
    expect(expressDepositsAdvanceAfter({ completed: "eu_kyc", payerCountry: "DE" })).toBe(
      "eu_identifiers",
    )
    expect(expressDepositsAdvanceAfter({ completed: "eu_identifiers", payerCountry: "DE" })).toBe(
      "eu_attestation",
    )
    expect(expressDepositsAdvanceAfter({ completed: "eu_attestation", payerCountry: "DE" })).toBe(
      "eu_l2",
    )
    expect(expressDepositsAdvanceAfter({ completed: "eu_l2", payerCountry: "DE" })).toBe("review")
    expect(expressDepositsAdvanceAfter({ completed: "link", payerCountry: "GB" })).toBe("us_kyc")
  })
})

describe("keepExpressDepositsCachedNextStep", () => {
  it("does not regress an in-progress step when live tiers are empty", () => {
    expect(
      keepExpressDepositsCachedNextStep({
        cached: "us_kyc",
        incoming: "link",
        incomingKycTiers: [],
      }),
    ).toBe("us_kyc")
    expect(
      keepExpressDepositsCachedNextStep({
        cached: "us_l2",
        incoming: "us_kyc",
        incomingKycTiers: [{ tier: "l1", verification_status: "verified" }],
      }),
    ).toBe("us_kyc")
    expect(
      keepExpressDepositsCachedNextStep({
        cached: "review",
        incoming: "eu_l2",
        incomingKycTiers: [{ tier: "l2", verification_status: "pending" }],
      }),
    ).toBe("review")
  })
})

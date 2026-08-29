import { describe, expect, it } from "vitest"
import {
  expressDepositsHighestVerifiedTier,
  expressDepositsNextStep,
  expressDepositsPersistStatus,
  isExpressIdentitySetupStep,
  isExpressReviewSetupStep,
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
          provided_fields: ["identifiers", "attestation", "first_name", "last_name", "address_line_1"],
        },
        walletRegistered: true,
      }),
    ).toBe("review")
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

import { describe, expect, it } from "vitest"
import { expressDepositsNextStep } from "./express-deposits-next-step"

describe("expressDepositsNextStep", () => {
  it("starts at link without a customer", () => {
    expect(expressDepositsNextStep({})).toBe("link")
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
          kyc_tiers: [{ tier: "l2", verification_status: "pending" }],
          provided_fields: [],
        },
      }),
    ).toBe("eu_identifiers")
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          kyc_region: "eu",
          kyc_tiers: [{ tier: "l2", verification_status: "pending" }],
          provided_fields: ["identifiers"],
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
          provided_fields: ["identifiers", "attestation"],
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
          verifications: [{ name: "kyc_verified", status: "verified" }],
          provided_fields: ["id_number", "attestation"],
        },
        payerCountry: "DE",
        walletRegistered: true,
      }),
    ).toBe("eu_l2")
  })

  it("skips US name/address when retrieve only returns the customer id", () => {
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: { id: "crc_1" },
        payerCountry: "US",
        walletRegistered: true,
      }),
    ).toBe("us_l2")
  })

  it("skips US name/address when Link already verified KYC", () => {
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          verifications: [
            { name: "kyc_verified", status: "verified" },
            { name: "id_document_verified", status: "not_started" },
          ],
        },
        payerCountry: "US",
        walletRegistered: true,
      }),
    ).toBe("us_l2")
  })

  it("uses official retrieve fields for ready", () => {
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          id: "crc_1",
          verifications: [
            { name: "kyc_verified", status: "verified" },
            { name: "id_document_verified", status: "verified" },
          ],
        },
        payerCountry: "US",
        walletRegistered: true,
      }),
    ).toBe("ready")
  })

  it("requires US L2 before ready", () => {
    expect(
      expressDepositsNextStep({
        cryptoCustomerId: "crc_1",
        customer: {
          kyc_region: "us",
          kyc_tiers: [
            { tier: "l1", verification_status: "verified" },
            { tier: "l2", verification_status: "not_started" },
          ],
        },
        walletRegistered: true,
      }),
    ).toBe("us_l2")
  })
})

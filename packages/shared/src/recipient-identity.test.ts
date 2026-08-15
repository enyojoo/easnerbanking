import { describe, expect, it } from "vitest"
import {
  buildDraftRecipientId,
  findMatchingRecipient,
  isDraftRecipientId,
  normalizeRecipientBankName,
  recipientIdentityFromUpsertInput,
  recipientIdentityFromWritePayload,
  recipientIdentityKey,
} from "./recipient-identity"

describe("recipient-identity", () => {
  it("builds easetag identity key case-insensitively", () => {
    const identity = recipientIdentityFromUpsertInput({
      recipientType: "easenet",
      payeeEasetag: "@Alice",
      fullName: "Alice",
      accountNumber: "alice",
      bankName: "",
      currency: "USD",
    })
    expect(identity).toEqual({ rail: "easetag", tag: "alice" })
    expect(recipientIdentityKey(identity!)).toBe("easetag:alice")
  })

  it("builds wallet identity from address and network", () => {
    const identity = recipientIdentityFromWritePayload({
      account_number: "0xAbC123",
      wallet_network: "ethereum",
      bank_name: "Wallet (USDC/ethereum)",
      currency: "USDC",
    })
    expect(identity).toEqual({
      rail: "wallet",
      network: "ethereum",
      address: "0xabc123",
    })
  })

  it("builds mobile identity from provider and phone", () => {
    const identity = recipientIdentityFromWritePayload({
      country_code: "NG",
      mobile_provider: "MTN",
      phone_number: "+234 801 234 5678",
      account_number: "+2348012345678",
      bank_name: "Mobile Money (MTN|CC:NG)",
      currency: "NGN",
    })
    expect(identity).toEqual({
      rail: "mobile",
      countryCode: "NG",
      provider: "MTN",
      phoneE164: "2348012345678",
    })
  })

  it("builds bank identity from IBAN", () => {
    const identity = recipientIdentityFromWritePayload({
      country_code: "DE",
      currency: "EUR",
      iban: "DE89 3704 0044 0532 0130 00",
      account_number: "0532013000",
      bank_name: "Commerzbank",
    })
    expect(identity?.rail).toBe("bank")
    expect(recipientIdentityKey(identity!)).toBe(
      "bank:DE:EUR:de89370400440532013000",
    )
  })

  it("findMatchingRecipient returns existing row with same identity", () => {
    const rows = [
      {
        id: "r1",
        country_code: "US",
        currency: "USD",
        account_number: "123456789",
        routing_number: "021000021",
        bank_name: "Chase",
      },
      {
        id: "r2",
        bank_name: "Easetag (@bob)",
        account_number: "bob",
        currency: "USD",
      },
    ]
    const identity = recipientIdentityFromUpsertInput({
      recipientType: "easenet",
      payeeEasetag: "bob",
      fullName: "Bob",
      accountNumber: "bob",
      bankName: "",
      currency: "USD",
    })
    expect(findMatchingRecipient(rows, identity!)?.id).toBe("r2")
  })

  it("normalizes wallet and mobile bank labels", () => {
    expect(
      normalizeRecipientBankName({
        recipientType: "wallet",
        walletAsset: "USDC",
        walletNetwork: "solana",
      }),
    ).toBe("Wallet (USDC/solana)")
    expect(
      normalizeRecipientBankName({
        recipientType: "mobile",
        mobileProvider: "MTN",
      }),
    ).toBe("Mobile Money (MTN)")
  })

  it("detects draft recipient ids", () => {
    expect(isDraftRecipientId("draft_easenet:alice")).toBe(true)
    expect(isDraftRecipientId("draft_bank:US:USD:123")).toBe(true)
    expect(isDraftRecipientId("uuid-here")).toBe(false)
  })

  it("builds draft recipient id from identity key", () => {
    expect(buildDraftRecipientId("easetag:alice")).toBe("draft_easetag:alice")
  })
})

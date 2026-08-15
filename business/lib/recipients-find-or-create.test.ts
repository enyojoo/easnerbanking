import { describe, expect, it } from "vitest"
import {
  findMatchingRecipient,
  recipientIdentityFromWritePayload,
} from "@easner/shared"

describe("recipients find-or-create identity", () => {
  it("matches duplicate easetag rows by tag", () => {
    const rows = [
      {
        id: "existing",
        bank_name: "Easetag (@alice)",
        account_number: "alice",
        currency: "USD",
      },
    ]
    const identity = recipientIdentityFromWritePayload({
      bank_name: "Easetag (@Alice)",
      account_number: "alice",
      currency: "USD",
    })
    expect(findMatchingRecipient(rows, identity!)?.id).toBe("existing")
  })

  it("matches duplicate bank rows by iban", () => {
    const rows = [
      {
        id: "bank-1",
        country_code: "DE",
        currency: "EUR",
        iban: "DE89370400440532013000",
        account_number: "0532013000",
        bank_name: "Commerzbank",
      },
    ]
    const identity = recipientIdentityFromWritePayload({
      country_code: "DE",
      currency: "EUR",
      iban: "DE89 3704 0044 0532 0130 00",
      account_number: "0532013000",
      bank_name: "Commerzbank",
    })
    expect(findMatchingRecipient(rows, identity!)?.id).toBe("bank-1")
  })

  it("matches duplicate wallet rows by network and address", () => {
    const rows = [
      {
        id: "wallet-1",
        bank_name: "Wallet (USDT/Tron)",
        account_number: "TXyz123",
        currency: "USDT",
        wallet_network: "Tron",
      },
    ]
    const identity = recipientIdentityFromWritePayload({
      bank_name: "Wallet (USDT/Tron)",
      account_number: "txyz123",
      currency: "USDT",
      wallet_network: "Tron",
    })
    expect(findMatchingRecipient(rows, identity!)?.id).toBe("wallet-1")
  })
})

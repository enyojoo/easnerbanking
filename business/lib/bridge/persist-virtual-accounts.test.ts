import { describe, expect, it } from "vitest"
import { bridgeVaBankDetails } from "./persist-virtual-accounts"

describe("bridgeVaBankDetails", () => {
  it("maps Bridge USD bank_* fields", () => {
    expect(
      bridgeVaBankDetails({
        id: "va_usd",
        source_deposit_instructions: {
          currency: "usd",
          bank_name: "Lead Bank",
          bank_address: "1801 Main St., Kansas City, MO 64108",
          bank_routing_number: "101019644",
          bank_account_number: "215268120000",
          bank_beneficiary_name: "Ada Lovelace",
        },
        destination: { currency: "usdc", payment_rail: "solana", address: "Addr1" },
      }),
    ).toEqual({
      currency: "USD",
      accountNumber: "215268120000",
      routingNumber: "101019644",
      iban: null,
      bic: null,
      bankName: "Lead Bank",
      bankAddress: "1801 Main St., Kansas City, MO 64108",
      accountHolderName: "Ada Lovelace",
    })
  })

  it("maps EUR iban instructions", () => {
    expect(
      bridgeVaBankDetails({
        id: "va_eur",
        source_deposit_instructions: {
          currency: "eur",
          iban: "DE89370400440532013000",
          bic: "COBADEFFXXX",
          bank_name: "Example Bank",
        },
        destination: { currency: "eurc", payment_rail: "solana", address: "Addr2" },
      }),
    ).toMatchObject({
      currency: "EUR",
      accountNumber: null,
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
    })
  })
})

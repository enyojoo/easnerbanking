import { describe, expect, it } from "vitest"
import { formatTransactionDetailHeroTitle } from "./transaction-detail-hero-title"
import { getGlobalPayoutTransferMethod } from "./payout-transfer-method"

describe("formatTransactionDetailHeroTitle", () => {
  it("formats outbound transfer hero", () => {
    expect(
      formatTransactionDetailHeroTitle({
        direction: "out",
        counterpartyName: "SAMUEL ODIBA ENYOJO",
      }),
    ).toBe("Transfer to Samuel Odiba Enyojo")
  })

  it("formats inbound deposit hero", () => {
    expect(
      formatTransactionDetailHeroTitle({
        direction: "in",
        counterpartyName: "GREY",
      }),
    ).toBe("Deposit from Grey")
  })
})

describe("getGlobalPayoutTransferMethod", () => {
  it("uses Bank transfer for NG bank corridor", () => {
    expect(
      getGlobalPayoutTransferMethod({
        currency: "NGN",
        countryCode: "NG",
        bankName: "Kuda",
      }),
    ).toBe("Bank transfer")
  })

  it("uses Mobile money when provider present", () => {
    expect(
      getGlobalPayoutTransferMethod({
        currency: "NGN",
        countryCode: "NG",
        mobileProvider: "MTN",
      }),
    ).toBe("Mobile money")
  })
})

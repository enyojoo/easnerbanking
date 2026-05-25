import { describe, expect, it } from "vitest"
import { formatTransactionDetailHeroTitle } from "./transaction-detail-hero-title"
import {
  getGlobalPayoutProcessingTime,
  getGlobalPayoutTransferMethod,
} from "./payout-transfer-method"
import { resolveOutboundTransactionListLabel } from "./transaction-list-label"

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

  it("uses SEPA Instant for EUR corridors", () => {
    expect(getGlobalPayoutTransferMethod({ currency: "EUR", countryCode: "DE" })).toBe(
      "SEPA Instant",
    )
  })
})

describe("getGlobalPayoutProcessingTime", () => {
  it("maps corridor methods to updated copy", () => {
    expect(getGlobalPayoutProcessingTime("Bank transfer")).toBe("Within minutes")
    expect(getGlobalPayoutProcessingTime("Mobile money")).toBe("Within minutes")
    expect(getGlobalPayoutProcessingTime("ACH")).toBe("Within 24 hours")
    expect(getGlobalPayoutProcessingTime("SEPA Instant")).toBe("Within minutes")
  })
})

describe("resolveOutboundTransactionListLabel", () => {
  it("shows recipient name only for global payout sends", () => {
    expect(
      resolveOutboundTransactionListLabel({
        name: "SAMUEL ODIBA ENYOJO",
        metadata: { payout_type: "global_fiat" },
      }),
    ).toBe("Samuel Odiba Enyojo")
  })

  it("keeps Sent to prefix for non-global outbound sends", () => {
    expect(
      resolveOutboundTransactionListLabel({
        name: "Jane Doe",
      }),
    ).toBe("Sent to Jane Doe")
  })
})

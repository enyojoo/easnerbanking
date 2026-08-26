import { describe, expect, it } from "vitest"
import { formatTransactionDetailHeroTitle } from "./transaction-detail-hero-title"
import {
  getGlobalPayoutProcessingTime,
  getGlobalPayoutTransferMethod,
  resolvePayoutNotificationActivityLabel,
} from "./payout-transfer-method"
import { resolveOutboundTransactionListLabel } from "./transaction-list-label"

describe("formatTransactionDetailHeroTitle", () => {
  it("formats outbound transfer hero", () => {
    expect(
      formatTransactionDetailHeroTitle({
        direction: "out",
        counterpartyName: "SAMUEL ODIBA ENYOJO",
      }),
    ).toBe("Samuel Odiba Enyojo")
  })

  it("formats inbound deposit hero as remitter name", () => {
    expect(
      formatTransactionDetailHeroTitle({
        direction: "in",
        counterpartyName: "GREY",
      }),
    ).toBe("Grey")
  })

  it("strips a stored Deposit from prefix on inbound heroes", () => {
    expect(
      formatTransactionDetailHeroTitle({
        direction: "in",
        counterpartyName: "Deposit from Bridge Building",
      }),
    ).toBe("Bridge Building")
  })

  it("preserves Easetag receive hero without Deposit from prefix", () => {
    expect(
      formatTransactionDetailHeroTitle({
        direction: "in",
        counterpartyName: "Received from @alice",
      }),
    ).toBe("Received from @alice")
  })
})

describe("getGlobalPayoutTransferMethod", () => {
  it("uses Easetag for payee easetag sends", () => {
    expect(getGlobalPayoutTransferMethod({ payeeEasetag: "enyo" })).toBe("Easetag")
  })

  it("uses Local transfer for NG bank corridor", () => {
    expect(
      getGlobalPayoutTransferMethod({
        currency: "NGN",
        countryCode: "NG",
        bankName: "Kuda",
      }),
    ).toBe("Local transfer")
  })

  it("uses Local transfer when mobile money provider present", () => {
    expect(
      getGlobalPayoutTransferMethod({
        currency: "NGN",
        countryCode: "NG",
        mobileProvider: "MTN",
      }),
    ).toBe("Local transfer")
  })

  it("uses SEPA Instant for EUR corridors", () => {
    expect(getGlobalPayoutTransferMethod({ currency: "EUR", countryCode: "DE" })).toBe(
      "SEPA Instant",
    )
  })
})

describe("resolvePayoutNotificationActivityLabel", () => {
  it("maps bank corridors to Bank transfer", () => {
    expect(
      resolvePayoutNotificationActivityLabel({
        transferMethod: "Bank transfer",
        currency: "NGN",
        countryCode: "NG",
        bankName: "Kuda",
      }),
    ).toBe("Bank transfer")
    expect(
      resolvePayoutNotificationActivityLabel({
        transferMethod: "Local transfer",
        currency: "NGN",
        countryCode: "NG",
        bankName: "Kuda",
      }),
    ).toBe("Bank transfer")
    expect(resolvePayoutNotificationActivityLabel({ transferMethod: "ACH" })).toBe("Bank transfer")
  })

  it("maps mobile corridors to Mobile transfer", () => {
    expect(
      resolvePayoutNotificationActivityLabel({
        transferMethod: "Mobile money transfer",
      }),
    ).toBe("Mobile transfer")
    expect(
      resolvePayoutNotificationActivityLabel({
        transferMethod: "Local transfer",
        currency: "NGN",
        countryCode: "NG",
        mobileProvider: "MTN",
      }),
    ).toBe("Mobile transfer")
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

  it("shows recipient name only for Grid balance payouts without payout_type", () => {
    expect(
      resolveOutboundTransactionListLabel({
        name: "Samuel Enyojo Odiba",
        metadata: { grid_mode: "balance_payout" },
      }),
    ).toBe("Samuel Enyojo Odiba")
  })

  it("keeps Sent to prefix for non-global outbound sends", () => {
    expect(
      resolveOutboundTransactionListLabel({
        name: "Jane Doe",
      }),
    ).toBe("Sent to Jane Doe")
  })
})

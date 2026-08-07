import { describe, expect, it } from "vitest"
import { isRelayTronDepositInbound, isRelayTronDepositMetadata } from "./relay-tron-deposit"
import {
  toEasnerTransactionPrimaryLabel,
  toEasnerTransactionProductCategory,
} from "./product-label"

describe("relay-tron-deposit", () => {
  const meta = {
    activity_type: "relay_tron_deposit",
    source_type: "relay_tron_deposit",
    source_payment_rail: "tron",
    source_currency: "USDT",
  }

  it("detects relay Tron deposit metadata", () => {
    expect(isRelayTronDepositMetadata(meta)).toBe(true)
    expect(isRelayTronDepositMetadata({ activity_type: "relay_tron_deposit" })).toBe(true)
    expect(isRelayTronDepositMetadata({ source_type: "relay_tron_deposit" })).toBe(true)
    expect(isRelayTronDepositMetadata({ activity_type: "wallet_send" })).toBe(false)
  })

  it("classifies inbound without provider when activity_type is present", () => {
    expect(
      isRelayTronDepositInbound({
        metadata: { activity_type: "relay_tron_deposit" },
      }),
    ).toBe(true)
  })

  it("maps relay Tron deposit to stablecoin product labels", () => {
    expect(
      toEasnerTransactionProductCategory({
        provider: "relay",
        direction: "in",
        metadata: meta,
      }),
    ).toBe("Stablecoin Deposit")
    expect(
      toEasnerTransactionPrimaryLabel({
        provider: "relay",
        direction: "in",
        metadata: meta,
      }),
    ).toBe("Stablecoin Deposit")
  })
})

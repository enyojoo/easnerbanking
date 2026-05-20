import { describe, expect, it } from "vitest"
import {
  isTurnkeyActivityNonLedgerEvent,
  isTurnkeyBalanceConfirmedPayload,
} from "@/lib/turnkey/turnkey-webhook-classify"

describe("isTurnkeyActivityNonLedgerEvent", () => {
  it("no-ops SOL_SEND activity", () => {
    expect(
      isTurnkeyActivityNonLedgerEvent({
        type: "ACTIVITY_TYPE_SOL_SEND_TRANSACTION",
        organizationId: "org-1",
      }),
    ).toBe(true)
  })

  it("no-ops CREATE_WALLET", () => {
    expect(
      isTurnkeyActivityNonLedgerEvent({
        activityType: "ACTIVITY_TYPE_CREATE_WALLET",
      }),
    ).toBe(true)
  })

  it("does not no-op balance confirmed payloads", () => {
    expect(
      isTurnkeyBalanceConfirmedPayload({
        eventType: "BALANCE_CONFIRMED_UPDATES",
        txHash: "5mCrW99z",
        amountMinor: "1000000",
        balanceDiff: { usdc: "1000000" },
      }),
    ).toBe(true)
    expect(
      isTurnkeyActivityNonLedgerEvent({
        eventType: "BALANCE_CONFIRMED_UPDATES",
        txHash: "5mCrW99z",
        amountMinor: "1000000",
        balanceDiff: { usdc: "1000000" },
      }),
    ).toBe(false)
  })
})

describe("isTurnkeyBalanceConfirmedPayload", () => {
  it("detects balance event type", () => {
    expect(
      isTurnkeyBalanceConfirmedPayload({
        type: "BALANCE_CONFIRMED",
        txHash: "abc",
        amount: 1,
      }),
    ).toBe(true)
  })
})

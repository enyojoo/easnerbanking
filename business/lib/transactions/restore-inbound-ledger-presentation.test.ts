import { describe, expect, it } from "vitest"
import { restoreInboundLedgerPresentation } from "@/lib/transactions/restore-inbound-ledger-presentation"

describe("restoreInboundLedgerPresentation", () => {
  it("restores receive/credit presentation for YC fund balance bank deposits", () => {
    const row = {
      provider: "yellowcard",
      direction: "in",
      status: "settled",
      amount: 2000,
      currency: "USD",
      metadata: {
        yc_mode: "fund_balance",
        flow: "bank_onramp",
        usd_credit: 2000,
        display_hero_title: "Kenya Bank Deposit",
      },
    }
    const broken = {
      type: "send",
      transaction_type: "send",
      direction: "debit",
      amount: 0,
      currency: "USD",
      status: "unknown",
      metadata: {
        noah: { id: "158bae5b", event: "RECEIVE.COMPLETE", sequenceId: "yc_fb_test" },
        display_hero_title: "Kenya Bank Deposit",
      },
    }

    const restored = restoreInboundLedgerPresentation(row, broken)

    expect(restored.transaction_type).toBe("receive")
    expect(restored.direction).toBe("credit")
    expect(restored.amount).toBe(2000)
    expect(restored.status).toBe("completed")
    expect(restored.display_amount).toBe(2000)
    expect((restored.metadata as Record<string, unknown>).noah).toBeUndefined()
  })

  it("shows local amount paid in display fields when metadata includes local pay-in", () => {
    const row = {
      provider: "yellowcard",
      direction: "in",
      status: "settled",
      amount: 65,
      currency: "USD",
      metadata: {
        yc_mode: "fund_balance",
        local_pay_in: 100000,
        local_currency: "NGN",
        usd_credit: 65,
      },
    }
    const broken = {
      type: "send",
      direction: "debit",
      amount: 65,
      currency: "USD",
      status: "unknown",
      metadata: {},
    }

    const restored = restoreInboundLedgerPresentation(row, broken)

    expect(restored.display_amount).toBe(100000)
    expect(restored.display_currency).toBe("NGN")
  })

  it("uses usd_credit when ledger amount is zero after Noah mis-map", () => {
    const row = {
      provider: "yellowcard",
      direction: "in",
      status: "settled",
      amount: 0,
      currency: "USD",
      metadata: {
        yc_mode: "fund_balance",
        usd_credit: 2500,
        settled_amount: 2500,
      },
    }
    const broken = {
      type: "send",
      direction: "debit",
      amount: 0,
      status: "unknown",
      currency: "USD",
      metadata: { noah: { id: "x", event: "RECEIVE.PROCESSING", sequenceId: "yc_fb_x" } },
    }

    const restored = restoreInboundLedgerPresentation(row, broken)

    expect(restored.amount).toBe(2500)
    expect(restored.display_amount).toBe(2500)
    expect(restored.direction).toBe("credit")
    expect(restored.status).toBe("completed")
  })
})

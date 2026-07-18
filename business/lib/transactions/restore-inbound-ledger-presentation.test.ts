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
})

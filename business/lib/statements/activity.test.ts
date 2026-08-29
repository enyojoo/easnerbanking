import { describe, expect, it } from "vitest"
import {
  buildActivityLine,
  isCompletedFeedRow,
  needsEasetagSenderLookup,
  resolvePrintAmount,
  resolveStatementDetails,
  statementLineType,
} from "./activity"

describe("statement activity", () => {
  it("classifies inbound as Deposit and outbound as Transfer", () => {
    expect(statementLineType("in")).toBe("Deposit")
    expect(statementLineType("out")).toBe("Transfer")
  })

  it("prints local pay-in and requested receive, not wallet impact", () => {
    expect(
      resolvePrintAmount({
        direction: "in",
        amount: 1.78,
        currency: "USD",
        metadata: { local_pay_in: 2575, local_currency: "NGN" },
      }),
    ).toEqual({ amount: 2575, currency: "NGN" })

    expect(
      resolvePrintAmount({
        direction: "out",
        amount: 1.48,
        currency: "USD",
        metadata: { requested_receive_amount: 2000, receive_currency: "NGN" },
      }),
    ).toEqual({ amount: 2000, currency: "NGN" })
  })

  it("uses counterpart handle when sender_easetag is empty", () => {
    const row = {
      provider: "easner_internal",
      direction: "in",
      amount: 19,
      currency: "USD",
      metadata: { source: "easetag_p2p", sender_easetag: "", transfer_group_id: "g1" },
    }
    expect(needsEasetagSenderLookup(row)).toBe(true)
    expect(resolveStatementDetails(row)).toBe("Easetag Received")
    expect(resolveStatementDetails(row, "easner")).toBe("Received from @easner")
  })

  it("builds a deposit line with local In amount", () => {
    const line = buildActivityLine(
      {
        direction: "in",
        status: "settled",
        amount: 1.78,
        currency: "USD",
        provider: "yellowcard",
        occurred_at: "2026-07-21T10:00:00.000Z",
        metadata: {
          local_pay_in: 2575,
          local_currency: "NGN",
          yc_mode: "fund_balance",
        },
      },
      "21 Jul 2026",
    )
    expect(line.type).toBe("Deposit")
    expect(line.moneyIn).toBe("₦2,575")
    expect(line.moneyOut).toBe("")
  })

  it("includes only successful feed rows in statement totals", () => {
    expect(isCompletedFeedRow({ status: "settled", hidden_from_feed: false })).toBe(true)
    expect(isCompletedFeedRow({ status: "deposited", hidden_from_feed: false })).toBe(true)
    expect(isCompletedFeedRow({ status: "pending", hidden_from_feed: false })).toBe(false)
    expect(isCompletedFeedRow({ status: "processing", hidden_from_feed: false })).toBe(false)
    expect(isCompletedFeedRow({ status: "failed", hidden_from_feed: false })).toBe(false)
    expect(isCompletedFeedRow({ status: "settled", hidden_from_feed: true })).toBe(false)
  })
})

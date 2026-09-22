import { describe, expect, it } from "vitest"
import { sumMoneyFlows } from "./money-flow-summary"

const usdEur = [{ from_currency: "USD", to_currency: "EUR", rate: 0.9 }]

describe("sumMoneyFlows", () => {
  it("sums every successful row, not a page slice", () => {
    const rows = [
      { direction: "credit", status: "completed", amount: 100, currency: "USD" },
      { direction: "debit", status: "settled", amount: 40, currency: "USD" },
      { direction: "credit", status: "pending", amount: 999, currency: "USD" },
      { direction: "debit", status: "failed", amount: 10, currency: "USD" },
      { direction: "in", status: "confirmed", amount: 25, currency: "USD" },
    ]
    expect(sumMoneyFlows(rows, "USD", [])).toEqual({
      moneyIn: 125,
      moneyOut: 40,
      count: 5,
      successfulCount: 3,
    })
  })

  it("converts wallet currencies into the reporting base", () => {
    const rows = [
      { direction: "credit", status: "completed", amount: 100, currency: "USD" },
      { direction: "debit", status: "completed", amount: 50, currency: "EUR" },
    ]
    const summary = sumMoneyFlows(rows, "EUR", usdEur)
    expect(summary.moneyIn).toBeCloseTo(90)
    expect(summary.moneyOut).toBe(50)
  })
})

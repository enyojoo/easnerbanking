import { describe, expect, it } from "vitest"
import { seedQuoteReceiveForSendBudget } from "@/lib/noah/payout-quote-send-budget"

describe("seedQuoteReceiveForSendBudget", () => {
  it("uses db rate for cross-currency send budget", () => {
    expect(
      seedQuoteReceiveForSendBudget({
        sendBudget: 5,
        sourceCurrency: "USD",
        receiveCurrency: "NGN",
        clientReceiveAmount: 6677.64,
        dbRate: 1335.528,
      }),
    ).toBe(6678)
  })

  it("falls back to client receive when rate missing", () => {
    expect(
      seedQuoteReceiveForSendBudget({
        sendBudget: 5,
        sourceCurrency: "USD",
        receiveCurrency: "NGN",
        clientReceiveAmount: 6700,
        dbRate: null,
      }),
    ).toBe(6700)
  })

  it("rounds fractional NGN receive to whole units", () => {
    expect(
      seedQuoteReceiveForSendBudget({
        sendBudget: 4.89,
        sourceCurrency: "USD",
        receiveCurrency: "NGN",
        clientReceiveAmount: 6530.85,
        dbRate: 1335.528,
      }),
    ).toBe(6531)
  })
})

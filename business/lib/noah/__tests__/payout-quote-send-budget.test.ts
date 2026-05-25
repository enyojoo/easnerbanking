import { describe, expect, it, vi } from "vitest"
import {
  resolvePrepareForSendEntry,
  seedQuoteReceiveForSendBudget,
} from "@/lib/noah/payout-quote-send-budget"

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
    ).toBe(6677.64)
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
})

describe("resolvePrepareForSendEntry", () => {
  it("returns first successful prepare without capping total debited", async () => {
    const runPrepare = vi.fn(async (amount: number) => ({
      channelId: "ch",
      prep: { cryptoAuthorizedAmount: String(amount / 1200 + 0.35) },
    }))

    const result = await resolvePrepareForSendEntry({
      initialReceive: 6677.64,
      runPrepare,
    })

    expect(result.receiveAmount).toBe(6677.64)
    expect(Number.parseFloat(result.prepared.prep.cryptoAuthorizedAmount)).toBeGreaterThan(5)
    expect(runPrepare).toHaveBeenCalledTimes(1)
  })

  it("walks down when initial prepare fails", async () => {
    const runPrepare = vi.fn(async (amount: number) => {
      if (amount > 6600) {
        throw new Error("bad request")
      }
      return {
        channelId: "ch",
        prep: { cryptoAuthorizedAmount: "5.40" },
      }
    })

    const result = await resolvePrepareForSendEntry({
      initialReceive: 6677.64,
      runPrepare,
    })

    expect(result.receiveAmount).toBeLessThanOrEqual(6600)
    expect(runPrepare.mock.calls.length).toBeGreaterThan(1)
  })
})

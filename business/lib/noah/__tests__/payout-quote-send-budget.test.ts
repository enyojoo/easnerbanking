import { describe, expect, it, vi } from "vitest"
import {
  resolvePrepareWithinSendBudget,
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

describe("resolvePrepareWithinSendBudget", () => {
  it("returns first prepare when already within budget", async () => {
    const runPrepare = vi.fn(async (amount: number) => ({
      channelId: "ch",
      prep: { cryptoAuthorizedAmount: String(amount / 1300) },
    }))

    const result = await resolvePrepareWithinSendBudget({
      sendBudget: 5,
      initialReceive: 6500,
      runPrepare,
    })

    expect(result.receiveAmount).toBe(6500)
    expect(runPrepare).toHaveBeenCalledTimes(1)
  })

  it("binary-searches down when first prepare exceeds budget", async () => {
    const runPrepare = vi.fn(async (amount: number) => {
      if (amount > 6800) {
        throw new Error("bad request")
      }
      return {
        channelId: "ch",
        prep: { cryptoAuthorizedAmount: (amount / 1200).toFixed(2) },
      }
    })

    const result = await resolvePrepareWithinSendBudget({
      sendBudget: 5,
      initialReceive: 6677.64,
      runPrepare,
    })

    expect(result.receiveAmount).toBeLessThanOrEqual(6750)
    expect(Number.parseFloat(result.prepared.prep.cryptoAuthorizedAmount)).toBeLessThanOrEqual(
      5.01,
    )
    expect(runPrepare.mock.calls.length).toBeGreaterThan(1)
  })

  it("walks down when initial prepare fails", async () => {
    const runPrepare = vi.fn(async (amount: number) => {
      if (amount > 6600) {
        throw new Error("bad request")
      }
      return {
        channelId: "ch",
        prep: { cryptoAuthorizedAmount: "4.95" },
      }
    })

    const result = await resolvePrepareWithinSendBudget({
      sendBudget: 5,
      initialReceive: 6677.64,
      runPrepare,
    })

    expect(result.receiveAmount).toBeLessThanOrEqual(6600)
    expect(Number.parseFloat(result.prepared.prep.cryptoAuthorizedAmount)).toBeLessThanOrEqual(5.01)
  })

  it("walks down when scaled retry fails after first over-budget prepare", async () => {
    const runPrepare = vi.fn(async (amount: number) => {
      if (amount > 6500) {
        return {
          channelId: "ch",
          prep: { cryptoAuthorizedAmount: "5.40" },
        }
      }
      if (amount > 6200) {
        throw new Error("bad request")
      }
      return {
        channelId: "ch",
        prep: { cryptoAuthorizedAmount: "4.98" },
      }
    })

    const result = await resolvePrepareWithinSendBudget({
      sendBudget: 5,
      initialReceive: 6677.64,
      runPrepare,
    })

    expect(result.receiveAmount).toBeLessThanOrEqual(6200)
    expect(Number.parseFloat(result.prepared.prep.cryptoAuthorizedAmount)).toBeLessThanOrEqual(5.01)
  })
})

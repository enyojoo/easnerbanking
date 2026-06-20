import { describe, expect, it, vi } from "vitest"
import type { LifiQuoteResponse } from "@/lib/lifi/client"
import {
  findMinLifiFromAmountRaw,
  fromAmountRawToHuman,
  maxLifiReceiveSearchSourceHuman,
  meetsLifiReceiveTarget,
} from "../lifi-receive-search"

describe("meetsLifiReceiveTarget", () => {
  it("requires toAmount within slippage of receive target", () => {
    expect(meetsLifiReceiveTarget(9.7, 10, 0.03)).toBe(true)
    expect(meetsLifiReceiveTarget(9.69, 10, 0.03)).toBe(false)
  })
})

describe("maxLifiReceiveSearchSourceHuman", () => {
  it("caps search high bound from planning mid", () => {
    expect(maxLifiReceiveSearchSourceHuman({ receiveAmount: 10, lifiMid: 0.5, minSourceHuman: 7 })).toBe(50)
    expect(maxLifiReceiveSearchSourceHuman({ receiveAmount: 10, lifiMid: 1, minSourceHuman: 7 })).toBe(25)
  })
})

describe("findMinLifiFromAmountRaw", () => {
  it("picks minimum fromAmount that meets receive target", async () => {
    const quoteFn = vi.fn(async (fromAmountRaw: string): Promise<LifiQuoteResponse> => {
      const from = Number(fromAmountRaw) / 1e6
      let to = 0
      if (from < 10) to = from * 0.7
      else if (from < 12) to = 8
      else if (from < 14) to = 9.8
      else to = 12
      return { estimate: { fromAmount: fromAmountRaw, toAmount: String(Math.round(to * 1e6)) } }
    })

    const { fromAmountRaw } = await findMinLifiFromAmountRaw({
      receiveAmount: 10,
      lifiMid: 1,
      sourceDecimals: 6,
      destDecimals: 6,
      slippage: 0.03,
      minSourceHuman: 7,
      maxSourceHuman: 50,
      initialHighRaw: "10000000",
      quoteFn,
    })

    expect(fromAmountRawToHuman(fromAmountRaw, 6)).toBeGreaterThanOrEqual(12)
    expect(fromAmountRawToHuman(fromAmountRaw, 6)).toBeLessThanOrEqual(13)
    expect(quoteFn).toHaveBeenCalled()
  })

  it("throws when target is unreachable within cap", async () => {
    const quoteFn = vi.fn(async (fromAmountRaw: string): Promise<LifiQuoteResponse> => ({
      estimate: {
        fromAmount: fromAmountRaw,
        toAmount: String(Math.round(fromAmountRawToHuman(fromAmountRaw, 6) * 0.3 * 1e6)),
      },
    }))

    await expect(
      findMinLifiFromAmountRaw({
        receiveAmount: 10,
        lifiMid: 1,
        sourceDecimals: 6,
        destDecimals: 6,
        slippage: 0.03,
        minSourceHuman: 7,
        maxSourceHuman: 20,
        initialHighRaw: "7000000",
        quoteFn,
      }),
    ).rejects.toThrow("lifi_receive_target_not_met")
  })
})

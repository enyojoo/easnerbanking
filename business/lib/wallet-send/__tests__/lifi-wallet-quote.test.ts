import { describe, expect, it } from "vitest"
import { getLifiBridgeMinSourceUsdc, minReceiveForLifiBridge } from "../lifi-wallet-quote"
import { estimateLifiFromAmountRaw, lifiMinFromAmountRaw } from "../lifi-from-amount"

describe("lifiMinFromAmountRaw", () => {
  it("enforces 7 USDC floor in base units", () => {
    expect(lifiMinFromAmountRaw("1000000", 6, 7)).toBe("7000000")
    expect(lifiMinFromAmountRaw("10000000", 6, 7)).toBe("10000000")
  })
})

describe("estimateLifiFromAmountRaw", () => {
  it("never estimates below bridge minimum source", () => {
    const raw = estimateLifiFromAmountRaw({
      receiveAmount: 1,
      customerRate: 1,
      lifiMid: 1,
      sourceDecimals: 6,
      minSourceHuman: 7,
    })
    expect(Number(raw)).toBeGreaterThanOrEqual(7_000_000)
  })
})

describe("minReceiveForLifiBridge", () => {
  it("derives receive floor from customer rate", () => {
    expect(minReceiveForLifiBridge(1, 7)).toBe(7)
    expect(minReceiveForLifiBridge(0.5, 7)).toBe(14)
  })

  it("defaults to env-backed 7 USDC source floor", () => {
    expect(getLifiBridgeMinSourceUsdc()).toBeGreaterThanOrEqual(7)
  })
})

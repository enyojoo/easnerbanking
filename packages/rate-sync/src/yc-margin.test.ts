import { describe, expect, it } from "vitest"
import {
  applyYcCustomerBuy,
  applyYcCustomerCrossRate,
  applyYcCustomerSell,
} from "./yc-margin"

describe("yc-margin", () => {
  it("applies 0.5% buy/sell asymmetry", () => {
    expect(applyYcCustomerBuy(1000)).toBeCloseTo(995, 10)
    expect(applyYcCustomerSell(1000)).toBeCloseTo(1000 / 0.995, 10)
  })

  it("cross rate matches (buy/sell)×0.995", () => {
    const { ycCrossMid, rate } = applyYcCustomerCrossRate(135, 1420)
    expect(ycCrossMid).toBeCloseTo(135 / 1420, 10)
    expect(rate).toBeCloseTo((135 / 1420) * 0.995, 10)
  })
})

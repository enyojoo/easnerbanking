import { describe, expect, it } from "vitest"
import {
  applyYcCustomerBuy,
  applyYcCustomerCrossRate,
  applyYcCustomerSell,
} from "./yc-margin"

describe("yc-margin", () => {
  it("applies 0.5% buy/sell asymmetry on correct YC legs", () => {
    expect(applyYcCustomerBuy(1390)).toBeCloseTo(1390 * 0.995, 10)
    expect(applyYcCustomerSell(1410)).toBeCloseTo(1410 / 0.995, 10)
  })

  it("cross rate matches (yc_sell_to / yc_buy_from)×0.995", () => {
    const { ycCrossMid, rate } = applyYcCustomerCrossRate(132, 1500)
    expect(ycCrossMid).toBeCloseTo(132 / 1500, 10)
    expect(rate).toBeCloseTo((132 / 1500) * 0.995, 10)
  })
})

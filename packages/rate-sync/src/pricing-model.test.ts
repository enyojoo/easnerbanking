import { describe, expect, it } from "vitest"
import { crossRate } from "./build-legs"
import { pipeline, tierForCurrency } from "./pricing-model"

describe("crossRate", () => {
  it("computes rate from easner legs", () => {
    const legs = {
      USD: {
        ...pipeline(1, 1, tierForCurrency("USD")),
        source: "spot",
      },
      NGN: {
        ...pipeline(1600, 1500, tierForCurrency("NGN")),
        source: "p2p",
      },
    }
    legs.USD.easner_buy = 1
    legs.NGN.easner_sell = 1450
    const rate = crossRate("USD", "NGN", legs)
    expect(rate).toBeCloseTo(1450 / 1, 6)
  })
})

import { describe, expect, it } from "vitest"
import { resolveYcPayInCustomerRate } from "./yc-pay-in-rates"

describe("resolveYcPayInCustomerRate", () => {
  it("returns easner_sell for local → USDC leg", () => {
    const rate = resolveYcPayInCustomerRate(
      [
        {
          from_currency: "NGN",
          to_currency: "USDC",
          rate: 0.00065,
          easner_sell: 1527.63819,
        },
      ],
      "NGN",
    )
    expect(rate).toBe(1527.63819)
  })

  it("returns null when easner_sell missing", () => {
    expect(
      resolveYcPayInCustomerRate(
        [{ from_currency: "NGN", to_currency: "USDC", rate: 0.00065 }],
        "NGN",
      ),
    ).toBeNull()
  })

  it("ignores wrong destination legs", () => {
    expect(
      resolveYcPayInCustomerRate(
        [{ from_currency: "USD", to_currency: "NGN", rate: 1527, easner_sell: 1527 }],
        "NGN",
      ),
    ).toBeNull()
  })
})

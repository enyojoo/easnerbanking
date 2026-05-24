import { describe, expect, it } from "vitest"
import {
  computeEnteredAmountForReceiveMin,
  computePayoutReceiveAmount,
} from "./payout-min-enforcement"

describe("computePayoutReceiveAmount", () => {
  it("returns entered amount in receive mode", () => {
    expect(
      computePayoutReceiveAmount({
        amountEntryMode: "receive",
        enteredAmount: 25,
        sendCurrency: "USD",
        receiveCurrency: "NGN",
        rateMap: {},
      }),
    ).toBe(25)
  })
})

describe("computeEnteredAmountForReceiveMin", () => {
  it("returns min receive in receive entry mode", () => {
    expect(
      computeEnteredAmountForReceiveMin({
        minReceive: 5000,
        amountEntryMode: "receive",
        sendCurrency: "USD",
        receiveCurrency: "NGN",
        rateMap: { "USD-NGN": 1500 },
      }),
    ).toBe(5000)
  })
})

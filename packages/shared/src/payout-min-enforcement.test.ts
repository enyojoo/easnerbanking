import { describe, expect, it } from "vitest"
import { noahWalletRowsToRateMap } from "./noah-send-rates"
import {
  computeEnteredAmountForReceiveMin,
  computePayoutReceiveAmount,
  payoutReceiveMeetsMin,
} from "./payout-min-enforcement"

const rateMap = noahWalletRowsToRateMap([
  { from_currency: "USD", to_currency: "NGN", rate: 1352.815 },
])

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

  it("derives normalized receive in send mode", () => {
    expect(
      computePayoutReceiveAmount({
        amountEntryMode: "send",
        enteredAmount: 7.39,
        sendCurrency: "USD",
        receiveCurrency: "NGN",
        rateMap,
      }),
    ).toBe(9997)
  })
})

describe("computeEnteredAmountForReceiveMin", () => {
  it("returns min receive in receive entry mode", () => {
    expect(
      computeEnteredAmountForReceiveMin({
        minReceive: 1000,
        amountEntryMode: "receive",
        sendCurrency: "USD",
        receiveCurrency: "NGN",
        rateMap,
      }),
    ).toBe(1000)
  })

  it("bumps send so normalized receive meets min (send entry mode)", () => {
    const sendAmount = computeEnteredAmountForReceiveMin({
      minReceive: 10_000,
      amountEntryMode: "send",
      sendCurrency: "USD",
      receiveCurrency: "NGN",
      rateMap,
    })
    expect(sendAmount).toBeGreaterThan(7.39)
    const receive = computePayoutReceiveAmount({
      amountEntryMode: "send",
      enteredAmount: sendAmount,
      sendCurrency: "USD",
      receiveCurrency: "NGN",
      rateMap,
    })
    expect(receive).toBeGreaterThanOrEqual(10_000)
    expect(
      payoutReceiveMeetsMin({
        receiveAmount: receive,
        minReceive: 10_000,
        receiveCurrency: "NGN",
      }),
    ).toBe(true)
  })

  it("meets ₦1000 minimum from send entry mode", () => {
    const sendAmount = computeEnteredAmountForReceiveMin({
      minReceive: 1000,
      amountEntryMode: "send",
      sendCurrency: "USD",
      receiveCurrency: "NGN",
      rateMap,
    })
    const receive = computePayoutReceiveAmount({
      amountEntryMode: "send",
      enteredAmount: sendAmount,
      sendCurrency: "USD",
      receiveCurrency: "NGN",
      rateMap,
    })
    expect(receive).toBeGreaterThanOrEqual(1000)
  })
})

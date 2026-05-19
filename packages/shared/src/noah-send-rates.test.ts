import { describe, expect, it } from "vitest"
import {
  convertNoahSendFlowAmounts,
  getNoahSendConversionRate,
  noahSendRatesQueryPath,
  noahWalletRowsToRateMap,
} from "./noah-send-rates"

describe("noahSendRatesQueryPath", () => {
  it("includes destinations for valid ISO code", () => {
    expect(noahSendRatesQueryPath("ngn")).toBe(
      "/api/noah/exchange-rates?destinations=NGN",
    )
  })
})

describe("getNoahSendConversionRate", () => {
  it("uses Noah map then reference fallback", () => {
    const map = noahWalletRowsToRateMap([
      { from_currency: "USD", to_currency: "NGN", rate: 1500 },
    ])
    expect(getNoahSendConversionRate(map, "USD", "NGN")).toBe(1500)
    expect(getNoahSendConversionRate({}, "USD", "EUR")).toBeGreaterThan(0)
  })
})

describe("convertNoahSendFlowAmounts", () => {
  const map = noahWalletRowsToRateMap([
    { from_currency: "USD", to_currency: "NGN", rate: 1352.815 },
  ])

  it("receive-entered: send = receive / forward rate", () => {
    const o = convertNoahSendFlowAmounts({
      direction: "receive",
      amount: 10_000,
      sendCurrency: "USD",
      receiveCurrency: "NGN",
      rateMap: map,
    })
    expect(o.receiveAmount).toBe(10_000)
    expect(o.sendAmount).toBeCloseTo(10_000 / 1352.815, 2)
    expect(o.forwardRate).toBe(1352.815)
  })

  it("send-entered: receive = send × forward rate (round-trip)", () => {
    const fromReceive = convertNoahSendFlowAmounts({
      direction: "receive",
      amount: 10_000,
      sendCurrency: "USD",
      receiveCurrency: "NGN",
      rateMap: map,
    })
    const fromSend = convertNoahSendFlowAmounts({
      direction: "send",
      amount: fromReceive.sendAmount,
      sendCurrency: "USD",
      receiveCurrency: "NGN",
      rateMap: map,
    })
    expect(fromSend.receiveAmount).toBeCloseTo(10_000, 1)
  })
})

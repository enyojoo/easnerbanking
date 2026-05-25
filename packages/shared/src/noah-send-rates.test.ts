import { describe, expect, it } from "vitest"
import {
  convertNoahSendFlowAmounts,
  getNoahSendConversionRate,
  isNoahSendRateRowFresh,
  noahSendRatesQueryPath,
  noahWalletRowsToRateMap,
  normalizePayoutReceiveAmount,
  payoutReceiveAmountsMatch,
} from "./noah-send-rates"

describe("noahSendRatesQueryPath", () => {
  it("includes destinations for valid ISO code", () => {
    expect(noahSendRatesQueryPath("ngn")).toBe(
      "/api/fx/noah-rates?destinations=NGN",
    )
  })
})

describe("isNoahSendRateRowFresh", () => {
  it("rejects missing as_of and accepts recent rows", () => {
    expect(isNoahSendRateRowFresh(null)).toBe(false)
    expect(
      isNoahSendRateRowFresh({
        from_currency: "USD",
        to_currency: "NGN",
        rate: 1288,
        as_of: new Date().toISOString(),
      }),
    ).toBe(true)
    expect(
      isNoahSendRateRowFresh(
        {
          from_currency: "USD",
          to_currency: "NGN",
          rate: 1288,
          as_of: new Date(Date.now() - 20 * 60_000).toISOString(),
        },
        900_000,
      ),
    ).toBe(false)
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

  it("send-entered: receive = send × forward rate (normalized round-trip)", () => {
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
    expect(fromSend.receiveAmount).toBe(
      normalizePayoutReceiveAmount(fromReceive.sendAmount * 1352.815),
    )
  })

  it("send-entered: normalizes receive to 2dp for Noah prepare", () => {
    const o = convertNoahSendFlowAmounts({
      direction: "send",
      amount: 7.39,
      sendCurrency: "USD",
      receiveCurrency: "NGN",
      rateMap: map,
    })
    expect(o.receiveAmount).toBe(
      normalizePayoutReceiveAmount(7.39 * 1352.815),
    )
    expect(o.receiveAmount).toBe(9997.3)
  })
})

describe("payoutReceiveAmountsMatch", () => {
  it("treats sub-cent noise as equal after normalization", () => {
    expect(payoutReceiveAmountsMatch(9997.30385, 9997.3)).toBe(true)
    expect(payoutReceiveAmountsMatch(10_000, 9999.99)).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import {
  convertNoahSendFlowAmounts,
  getNoahSendConversionRate,
  hasNoahSendRateRow,
  isNoahSendRateRowFresh,
  mapGridBalancePayoutRateRows,
  noahSendRatesQueryPath,
  noahWalletRowsToRateMap,
  normalizePayoutReceiveAmount,
  normalizePayoutReceiveAmountForCurrency,
  formatPayoutFiatAmountForPrepare,
  payoutReceiveAmountsMatch,
  payoutReceiveAmountsMatchForCurrency,
} from "./noah-send-rates"

describe("noahSendRatesQueryPath", () => {
  it("includes destinations for valid ISO code", () => {
    expect(noahSendRatesQueryPath("ngn")).toBe(
      "/api/fx/noah-rates?destinations=NGN",
    )
  })
})

describe("hasNoahSendRateRow", () => {
  it("accepts positive rates regardless of age", () => {
    expect(hasNoahSendRateRow(null)).toBe(false)
    expect(hasNoahSendRateRow({ rate: 0 })).toBe(false)
    expect(
      hasNoahSendRateRow({
        rate: 1288,
      }),
    ).toBe(true)
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
        300_000,
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
      normalizePayoutReceiveAmountForCurrency("NGN", fromReceive.sendAmount * 1352.815),
    )
  })

  it("send-entered: normalizes NGN receive to whole units for Noah prepare", () => {
    const o = convertNoahSendFlowAmounts({
      direction: "send",
      amount: 7.39,
      sendCurrency: "USD",
      receiveCurrency: "NGN",
      rateMap: map,
    })
    expect(o.receiveAmount).toBe(9997)
  })

  it("send-entered: normalizes IDR receive to whole rupiah", () => {
    const idrMap = noahWalletRowsToRateMap([
      { from_currency: "USD", to_currency: "IDR", rate: 16_500 },
    ])
    const o = convertNoahSendFlowAmounts({
      direction: "send",
      amount: 100,
      sendCurrency: "USD",
      receiveCurrency: "IDR",
      rateMap: idrMap,
    })
    expect(o.receiveAmount).toBe(1_650_000)
    expect(Number.isInteger(o.receiveAmount)).toBe(true)
  })
})

describe("normalizePayoutReceiveAmountForCurrency", () => {
  it("rounds NGN to whole naira", () => {
    expect(normalizePayoutReceiveAmountForCurrency("NGN", 6530.85)).toBe(6531)
    expect(normalizePayoutReceiveAmountForCurrency("NGN", 6530)).toBe(6530)
  })

  it("keeps USD at two decimal places", () => {
    expect(normalizePayoutReceiveAmountForCurrency("USD", 5.555)).toBe(5.56)
  })

  it("rounds IDR to whole rupiah", () => {
    expect(normalizePayoutReceiveAmountForCurrency("IDR", 1_654_321.78)).toBe(1_654_322)
  })
})

describe("formatPayoutFiatAmountForPrepare", () => {
  it("formats zero-decimal fiats without fractional digits", () => {
    expect(formatPayoutFiatAmountForPrepare("IDR", 1_654_321.2)).toBe("1654321")
    expect(formatPayoutFiatAmountForPrepare("NGN", 6530.85)).toBe("6531")
  })

  it("formats USD with two decimal places", () => {
    expect(formatPayoutFiatAmountForPrepare("USD", 100)).toBe("100.00")
  })
})

describe("payoutReceiveAmountsMatchForCurrency", () => {
  it("treats fractional NGN as equal after integer rounding", () => {
    expect(payoutReceiveAmountsMatchForCurrency(6530.85, 6531, "NGN")).toBe(true)
  })
})

describe("payoutReceiveAmountsMatch", () => {
  it("treats sub-cent noise as equal after normalization", () => {
    expect(payoutReceiveAmountsMatch(9997.30385, 9997.3)).toBe(true)
    expect(payoutReceiveAmountsMatch(10_000, 9999.99)).toBe(false)
  })
})

describe("mapGridBalancePayoutRateRows", () => {
  it("inverts USD-per-local grid mid for send preview", () => {
    const usdPerNgn = 1 / 1500
    const mapped = mapGridBalancePayoutRateRows([
      {
        from_currency: "USD",
        to_currency: "NGN",
        rate: usdPerNgn,
        grid_mid: usdPerNgn,
        margin_bps: 50,
      },
    ])
    expect(mapped).toHaveLength(1)
    expect(mapped[0]?.rate).toBeCloseTo(1492.5, 2)

    const preview = convertNoahSendFlowAmounts({
      direction: "receive",
      amount: 2000,
      sendCurrency: "USD",
      receiveCurrency: "NGN",
      rateMap: { USD_NGN: mapped[0]!.rate },
    })
    expect(preview.sendAmount).toBeCloseTo(1.34, 1)
    expect(preview.receiveAmount).toBe(2000)
  })

  it("uses NGN→USD row when present (matches server findGridBalancePayoutRate)", () => {
    const mapped = mapGridBalancePayoutRateRows([
      {
        from_currency: "NGN",
        to_currency: "USD",
        grid_mid: 1500,
        rate: 1492.5,
        margin_bps: 50,
      },
    ])
    expect(mapped).toHaveLength(1)
    expect(mapped[0]?.from_currency).toBe("USD")
    expect(mapped[0]?.to_currency).toBe("NGN")
    expect(mapped[0]?.rate).toBe(1492.5)
  })

  it("resolves PHP send preview from USD-per-PHP grid mid", () => {
    const usdPerPhp = 0.01619190127775986
    const mapped = mapGridBalancePayoutRateRows([
      {
        from_currency: "USD",
        to_currency: "PHP",
        grid_mid: usdPerPhp,
        rate: usdPerPhp * (1 - 50 / 10_000),
        margin_bps: 50,
      },
      {
        from_currency: "PHP",
        to_currency: "USD",
        grid_mid: 1 / usdPerPhp,
        rate: 61.45047347630925,
        margin_bps: 50,
      },
    ])
    expect(mapped).toHaveLength(1)
    expect(mapped[0]?.from_currency).toBe("USD")
    expect(mapped[0]?.to_currency).toBe("PHP")
    expect(mapped[0]?.rate).toBeCloseTo(61.45, 1)
  })

  it("resolves PHP send preview from rate-only rows", () => {
    const mapped = mapGridBalancePayoutRateRows([
      { from_currency: "PHP", to_currency: "USD", rate: 61.45 },
      { from_currency: "USD", to_currency: "PHP", rate: 0.0161 },
    ])
    expect(mapped).toHaveLength(1)
    expect(mapped[0]?.rate).toBeCloseTo(61.45, 0)
  })
})

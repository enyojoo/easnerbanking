import { describe, expect, it } from "vitest"
import type { ExchangeRate } from "./types"
import { fxEngine } from "./fx-engine"

function row(
  from: string,
  to: string,
  rate: number,
  fee: ExchangeRate["fee_type"] = "free",
  feeAmount = 0,
): ExchangeRate {
  return {
    id: `${from}-${to}`,
    from_currency: from,
    to_currency: to,
    rate,
    fee_type: fee,
    fee_amount: feeAmount,
    status: "active",
    created_at: "",
    updated_at: "",
  }
}

describe("fxEngine.getRate", () => {
  it("returns identity for same currency", () => {
    const r = fxEngine.getRate([], "USD", "USD")
    expect(r?.rate).toBe(1)
    expect(r?.fee_type).toBe("free")
  })

  it("uses reverse row with inverted rate", () => {
    const rates = [row("EUR", "USD", 1.1)]
    const r = fxEngine.getRate(rates, "USD", "EUR")
    expect(r?.rate).toBeCloseTo(1 / 1.1, 8)
  })
})

describe("fxEngine.calculateOrderAmounts", () => {
  const rates = [row("USD", "NGN", 1500)]

  it("receive direction", () => {
    const o = fxEngine.calculateOrderAmounts({
      direction: "receive",
      amount: 150_000,
      fromCurrency: "USD",
      toCurrency: "NGN",
      exchangeRates: rates,
    })
    expect(o.receiveAmount).toBe(150_000)
    expect(o.sendAmount).toBe(100)
  })

  it("send direction", () => {
    const o = fxEngine.calculateOrderAmounts({
      direction: "send",
      amount: 100,
      fromCurrency: "USD",
      toCurrency: "NGN",
      exchangeRates: rates,
    })
    expect(o.sendAmount).toBe(100)
    expect(o.receiveAmount).toBe(150_000)
  })

  it("applies percentage fee on send amount", () => {
    const withFee = [row("USD", "NGN", 1500, "percentage", 2)]
    const o = fxEngine.calculateOrderAmounts({
      direction: "send",
      amount: 100,
      fromCurrency: "USD",
      toCurrency: "NGN",
      exchangeRates: withFee,
    })
    expect(o.feeAmount).toBe(2)
    expect(o.totalAmount).toBe(102)
    expect(o.receiveAmount).toBe(150_000)
  })
})

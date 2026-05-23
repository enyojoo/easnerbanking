import { describe, expect, it } from "vitest"
import { mapLegacyExchangeRateRow } from "./rates-service"

describe("mapLegacyExchangeRateRow", () => {
  it("maps Ciuna tuple fields to upsert row", () => {
    const row = mapLegacyExchangeRateRow({
      from_currency: "USD",
      to_currency: "NGN",
      rate: "1338.43252454",
      fee_type: "free",
      fee_amount: "0.0000",
      min_amount: "10.00",
      max_amount: "10000.00",
      status: "active",
    })
    expect(row).toEqual({
      from_currency: "USD",
      to_currency: "NGN",
      rate: 1338.43252454,
      fee_type: "free",
      fee_amount: 0,
      min_amount: 10,
      max_amount: 10000,
      status: "active",
    })
  })

  it("normalizes percentage fee rows", () => {
    const row = mapLegacyExchangeRateRow({
      from_currency: "NGN",
      to_currency: "RUB",
      rate: "0.05378801",
      fee_type: "percentage",
      fee_amount: "1.5",
      min_amount: "10000",
      max_amount: "1000000",
      status: "active",
    })
    expect(row.fee_type).toBe("percentage")
    expect(row.fee_amount).toBe(1.5)
  })
})

import { describe, expect, it } from "vitest"
import {
  areNoahRatesFresh,
  findNoahRate,
  isNoahRateFresh,
  type NoahRateRow,
} from "../noah-rates"

const sample: NoahRateRow[] = [
  {
    from_currency: "USD",
    to_currency: "NGN",
    country_code: "NG",
    noah_mid: 1356,
    rate: 1288,
    margin_bps: 500,
    source: "noah_prices_sync",
    as_of: new Date().toISOString(),
    fee_type: "free",
    fee_amount: 0,
    min_amount: null,
    max_amount: null,
    status: "active",
  },
]

describe("findNoahRate", () => {
  it("finds active pair", () => {
    expect(findNoahRate(sample, "USD", "NGN")?.rate).toBe(1288)
  })

  it("returns null for missing pair", () => {
    expect(findNoahRate(sample, "EUR", "NGN")).toBeNull()
  })
})

describe("isNoahRateFresh", () => {
  it("accepts recent active row", () => {
    expect(isNoahRateFresh(sample[0]!)).toBe(true)
  })

  it("rejects zero rate", () => {
    expect(isNoahRateFresh({ ...sample[0]!, rate: 0 })).toBe(false)
  })
})

describe("areNoahRatesFresh", () => {
  it("true when all active rows are recent", () => {
    expect(areNoahRatesFresh(sample, 60_000)).toBe(true)
  })
})

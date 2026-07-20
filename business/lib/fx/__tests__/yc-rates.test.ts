import { describe, expect, it } from "vitest"
import {
  findYcBalancePayoutRate,
  findYcCrossRate,
  findYcPayInLeg,
  type YcRateRow,
} from "../yc-rates"

const asOf = new Date().toISOString()

function row(partial: Partial<YcRateRow> & Pick<YcRateRow, "from_currency" | "to_currency" | "rate">): YcRateRow {
  return {
    country_code: null,
    yc_buy: null,
    yc_sell: null,
    easner_buy: null,
    easner_sell: null,
    yc_cross_mid: null,
    margin_bps: 50,
    source: "yc_rates_sync",
    as_of: asOf,
    status: "active",
    ...partial,
  }
}

const sample: YcRateRow[] = [
  row({
    from_currency: "USD",
    to_currency: "NGN",
    rate: 1512.4,
    yc_buy: 1500,
    easner_sell: 1507.53819,
    yc_sell: 1520,
    easner_buy: 1512.4,
  }),
  row({
    from_currency: "NGN",
    to_currency: "USDC",
    rate: 1507.53819,
    yc_buy: 1500,
    easner_sell: 1507.53819,
    yc_sell: 1520,
    easner_buy: 1512.4,
  }),
  row({
    from_currency: "NGN",
    to_currency: "KES",
    rate: 0.08756,
    yc_cross_mid: 132 / 1500,
  }),
]

describe("findYcBalancePayoutRate", () => {
  it("returns USD → receiveFiat only", () => {
    expect(findYcBalancePayoutRate(sample, "NGN")?.rate).toBe(1512.4)
  })

  it("does not fall back to local → USDC", () => {
    const withoutUsd = sample.filter((r) => !(r.from_currency === "USD" && r.to_currency === "NGN"))
    expect(findYcBalancePayoutRate(withoutUsd, "NGN")).toBeNull()
  })
})

describe("findYcPayInLeg", () => {
  it("returns local → USDC when easner_sell present", () => {
    expect(findYcPayInLeg(sample, "NGN")?.easner_sell).toBe(1507.53819)
  })

  it("returns null when easner_sell missing", () => {
    const broken = [
      row({
        from_currency: "NGN",
        to_currency: "USDC",
        rate: 1500,
        easner_sell: null,
      }),
    ]
    expect(findYcPayInLeg(broken, "NGN")).toBeNull()
  })
})

describe("findYcCrossRate", () => {
  it("finds fiat cross row", () => {
    expect(findYcCrossRate(sample, "NGN", "KES")?.rate).toBe(0.08756)
  })

  it("returns null for missing cross", () => {
    expect(findYcCrossRate(sample, "KES", "NGN")).toBeNull()
  })
})

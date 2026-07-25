import { describe, expect, it } from "vitest"
import {
  applyGridCustomerCrossRate,
  applyGridMargin,
  findGridBalancePayoutRate,
  findGridCrossRate,
  findGridPayInRate,
  type GridRateRow,
} from "../grid-rates"

const asOf = new Date().toISOString()
const marginBps = 50

function row(
  partial: Partial<GridRateRow> & Pick<GridRateRow, "from_currency" | "to_currency" | "rate">,
): GridRateRow {
  return {
    country_code: null,
    grid_mid: partial.rate,
    margin_bps: marginBps,
    source: "grid_rates_sync",
    as_of: asOf,
    status: "active",
    ...partial,
  }
}

describe("applyGridCustomerCrossRate", () => {
  it("triangulates dest per source through USD legs (YC parity shape)", () => {
    const usdPerNgn = 1 / 1500
    const usdPerKes = 1 / 132
    const { gridCrossMid, rate } = applyGridCustomerCrossRate(usdPerNgn, usdPerKes, marginBps)
    expect(gridCrossMid).toBeCloseTo(132 / 1500, 8)
    expect(rate).toBeCloseTo(applyGridMargin(132 / 1500, marginBps), 8)
  })
})

describe("findGridCrossRate", () => {
  const sample: GridRateRow[] = [
    row({
      from_currency: "USD",
      to_currency: "NGN",
      rate: applyGridMargin(1 / 1500, marginBps),
      grid_mid: 1 / 1500,
    }),
    row({
      from_currency: "NGN",
      to_currency: "USD",
      rate: applyGridMargin(1500, marginBps),
      grid_mid: 1500,
    }),
    row({
      from_currency: "NGN",
      to_currency: "KES",
      rate: applyGridMargin(132 / 1500, marginBps),
      grid_mid: 132 / 1500,
    }),
  ]

  it("finds fiat cross row", () => {
    expect(findGridCrossRate(sample, "NGN", "KES")?.rate).toBeCloseTo(
      applyGridMargin(132 / 1500, marginBps),
      8,
    )
  })

  it("returns null for missing cross", () => {
    expect(findGridCrossRate(sample, "KES", "NGN")).toBeNull()
  })
})

describe("findGridPayInRate", () => {
  it("returns local → USD when stored", () => {
    const rates: GridRateRow[] = [
      row({
        from_currency: "NGN",
        to_currency: "USD",
        rate: 1500,
        grid_mid: 1500,
      }),
    ]
    expect(findGridPayInRate(rates, "NGN")?.grid_mid).toBe(1500)
  })
})

describe("findGridBalancePayoutRate", () => {
  it("inverts USD→local mid to local-per-USD customer rate", () => {
    const usdPerNgn = 1 / 1500
    const rates: GridRateRow[] = [
      row({
        from_currency: "USD",
        to_currency: "NGN",
        rate: applyGridMargin(usdPerNgn, marginBps),
        grid_mid: usdPerNgn,
      }),
    ]
    const payout = findGridBalancePayoutRate(rates, "NGN")
    expect(payout?.grid_mid).toBeCloseTo(1500, 8)
    expect(payout?.rate).toBeCloseTo(applyGridMargin(1500, marginBps), 8)
  })

  it("uses stored local→USD row when present", () => {
    const rates: GridRateRow[] = [
      row({
        from_currency: "NGN",
        to_currency: "USD",
        rate: applyGridMargin(1500, marginBps),
        grid_mid: 1500,
      }),
    ]
    const payout = findGridBalancePayoutRate(rates, "NGN")
    expect(payout?.rate).toBeCloseTo(applyGridMargin(1500, marginBps), 8)
  })
})

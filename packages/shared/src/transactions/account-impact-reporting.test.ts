import { describe, expect, it } from "vitest"
import {
  convertWalletToReportingBase,
  resolveAccountImpactAmount,
  resolveReportingAmountForFeed,
} from "./account-impact-reporting"

const usdEur = [
  { from_currency: "USD", to_currency: "EUR", rate: 0.9 },
]

describe("resolveAccountImpactAmount", () => {
  it("uses the wallet debit instead of the recipient amount for global payouts", () => {
    expect(
      resolveAccountImpactAmount({
        direction: "out",
        amount: 50_000,
        currency: "NGN",
        ledger_amount: 25,
        ledger_currency: "USD",
        metadata: { receive_amount: 50_000, receive_currency: "NGN" },
      }),
    ).toMatchObject({ amount: 25, currency: "USD" })
  })

  it("uses credited USD for YC fund-balance pay-ins", () => {
    expect(
      resolveAccountImpactAmount({
        direction: "in",
        amount: 100_000,
        currency: "NGN",
        metadata: {
          yc_mode: "fund_balance",
          deposit_review: { usd_credit: 62.5 },
        },
      }),
    ).toMatchObject({ amount: 62.5, currency: "USD" })
  })

  it("uses the frozen quote valuation for YC cross-border", () => {
    expect(
      resolveAccountImpactAmount({
        direction: "out",
        amount: 160_000,
        currency: "NGN",
        metadata: {
          yc_mode: "cross_border_send",
          reporting_usd_amount: 100,
        },
      }),
    ).toEqual({
      amount: 100,
      currency: "USD",
      source: "reporting_snapshot",
    })
  })

  it("does not value a legacy YC cross-border row from local amounts", () => {
    expect(
      resolveAccountImpactAmount({
        direction: "out",
        amount: 160_000,
        currency: "NGN",
        metadata: {
          yc_mode: "cross_border_send",
          customer_rate: 42,
        },
      }),
    ).toBeNull()
  })

  it("normalizes stablecoin wallet sends", () => {
    expect(
      resolveAccountImpactAmount({
        direction: "out",
        ledger_amount: 10.1,
        ledger_currency: "EURC",
        metadata: { activity_type: "wallet_send" },
      }),
    ).toMatchObject({ amount: 10.1, currency: "EUR" })
  })
})

describe("reporting conversion", () => {
  it("converts EUR account impact to mobile USD", () => {
    expect(
      resolveReportingAmountForFeed(
        { direction: "in", amount: 90, currency: "EUR" },
        "USD",
        usdEur,
      ),
    ).toMatchObject({
      amount: 90,
      currency: "EUR",
      reportingAmount: 100,
      reportingCurrency: "USD",
    })
  })

  it("converts USD account impact to a EUR business base", () => {
    expect(
      convertWalletToReportingBase({
        amount: 100,
        walletCurrency: "USD",
        targetBase: "EUR",
        fxRates: usdEur,
      }),
    ).toEqual({ amount: 90, currency: "EUR", fxRate: 0.9 })
  })
})

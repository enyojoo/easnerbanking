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

  it("keeps a USD wallet debit that sits beside a local base currency", () => {
    // total_debited is USD; base_currency is the payout's local leg. Reading the
    // two independently discarded the row, so Money out lost the debit.
    expect(
      resolveAccountImpactAmount({
        direction: "out",
        amount: 200_000,
        currency: "USD",
        base_amount: 200_000,
        base_currency: "NGN",
        metadata: { total_debited: 128.4, payout_review: { send_currency: "USD" } },
      }),
    ).toMatchObject({ amount: 128.4, currency: "USD" })
  })

  it("never reports a local magnitude as the wallet currency", () => {
    // base_amount is NGN. It must not be paired with the USD send_currency.
    expect(
      resolveAccountImpactAmount({
        direction: "out",
        amount: 260_000,
        currency: "NGN",
        base_amount: 260_000,
        base_currency: "NGN",
        metadata: { payout_review: { send_currency: "USD" } },
      }),
    ).toBeNull()
  })

  it("prefers the credited wallet amount over a gross posted amount", () => {
    expect(
      resolveAccountImpactAmount({
        direction: "in",
        amount: 100_000,
        currency: "NGN",
        posted_amount: 100_000,
        posted_currency: "NGN",
        metadata: { deposit_review: { usd_credit: 61.2 } },
      }),
    ).toMatchObject({ amount: 61.2, currency: "USD" })
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

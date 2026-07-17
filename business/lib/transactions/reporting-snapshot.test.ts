import { describe, expect, it } from "vitest"
import {
  buildWalletReportingSnapshot,
  buildYcCrossBorderReportingSnapshot,
} from "./reporting-snapshot"

describe("reporting snapshots", () => {
  it("records USD wallet impact one-to-one", () => {
    expect(
      buildWalletReportingSnapshot({
        amount: 25,
        currency: "USDC",
        fxRates: [],
      }),
    ).toMatchObject({
      reporting_usd_amount: 25,
      reporting_wallet_amount: 25,
      reporting_wallet_currency: "USD",
      reporting_rate_source: "wallet",
    })
  })

  it("converts EUR wallet impact using reporting FX", () => {
    expect(
      buildWalletReportingSnapshot({
        amount: 90,
        currency: "EUR",
        fxRates: [
          { from_currency: "USD", to_currency: "EUR", rate: 0.9 },
        ],
      }),
    ).toMatchObject({
      reporting_usd_amount: 100,
      reporting_wallet_currency: "EUR",
      reporting_fx_rate: 1 / 0.9,
    })
  })

  it("freezes YC local-to-local Money Out from the source quote", () => {
    expect(
      buildYcCrossBorderReportingSnapshot({
        localPayIn: 160_000,
        payInCurrency: "NGN",
        easnerSellFrom: 1600,
        receiveCryptoUsd: 98,
        sendCryptoUsd: 97,
      }),
    ).toMatchObject({
      reporting_usd_amount: 100,
      reporting_source_amount: 160_000,
      reporting_source_currency: "NGN",
      reporting_source_to_usd_rate: 1600,
      reporting_rate_source: "yellowcard_quote",
    })
  })
})

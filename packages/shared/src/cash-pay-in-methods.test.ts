import { describe, expect, it } from "vitest"
import { listExpressCashKinds, localPayInCountries, resolveCashPayInMethods } from "./cash-pay-in-methods"

describe("localPayInCountries", () => {
  it("unions payer and business country", () => {
    expect(localPayInCountries({ payerCountry: "NG", businessCountry: "US" })).toEqual(["NG", "US"])
    expect(localPayInCountries({ payerCountry: "NG", businessCountry: "ng" })).toEqual(["NG"])
  })
})

describe("resolveCashPayInMethods", () => {
  const officeOn = { stripeOnrampEnabled: true, stripeOnrampEuEnabled: true }

  it("hides Stripe when payer is NG even if business is US", () => {
    const methods = resolveCashPayInMethods({
      product: "business",
      ledgerCurrency: "USD",
      payerCountry: "NG",
      businessCountry: "US",
      tier1Complete: true,
      expressDepositsReady: true,
      officeFlags: officeOn,
      localBankAvailable: true,
    })
    expect(methods.some((m) => m.kind.startsWith("express_"))).toBe(false)
    expect(methods.filter((m) => m.kind === "local_bank").map((m) => m.country)).toEqual(["NG", "US"])
  })

  it("shows Stripe for US payer not NY and ACH", () => {
    const methods = resolveCashPayInMethods({
      product: "mobile",
      ledgerCurrency: "USD",
      payerCountry: "US",
      payerState: "CA",
      tier1Complete: true,
      expressDepositsReady: true,
      officeFlags: officeOn,
      deviceWallets: { applePay: true, googlePay: false },
    })
    expect(methods.map((m) => m.kind)).toEqual(
      expect.arrayContaining(["express_card", "express_apple_pay", "express_ach"]),
    )
    expect(methods.some((m) => m.kind === "express_google_pay")).toBe(false)
  })

  it("marks Express rows setup_required until Express deposits is ready", () => {
    const methods = resolveCashPayInMethods({
      product: "mobile",
      ledgerCurrency: "USD",
      payerCountry: "US",
      payerState: "TX",
      tier1Complete: true,
      expressDepositsReady: false,
      officeFlags: officeOn,
    })
    const card = methods.find((m) => m.kind === "express_card")
    expect(card?.status).toBe("setup_required")
  })

  it("hides Express when office stripeOnrampEnabled is false", () => {
    const methods = resolveCashPayInMethods({
      product: "business",
      ledgerCurrency: "USD",
      payerCountry: "US",
      payerState: "CA",
      tier1Complete: true,
      expressDepositsReady: true,
      officeFlags: { stripeOnrampEnabled: false, stripeOnrampEuEnabled: true },
    })
    expect(methods.some((m) => m.kind.startsWith("express_"))).toBe(false)
  })

  it("does not show Stripe on EUR VA ledger", () => {
    const methods = resolveCashPayInMethods({
      product: "mobile",
      ledgerCurrency: "EUR",
      payerCountry: "US",
      payerState: "CA",
      tier1Complete: true,
      expressDepositsReady: true,
      officeFlags: officeOn,
    })
    expect(methods.some((m) => m.kind.startsWith("express_"))).toBe(false)
  })

  it("shows Stripe for EU payer", () => {
    const methods = resolveCashPayInMethods({
      product: "mobile",
      ledgerCurrency: "USD",
      payerCountry: "DE",
      tier1Complete: true,
      expressDepositsReady: true,
      officeFlags: officeOn,
      deviceWallets: { applePay: false, googlePay: false },
    })
    expect(methods.some((m) => m.kind === "express_card")).toBe(true)
    expect(methods.some((m) => m.kind === "express_ach")).toBe(false)
  })
})

describe("listExpressCashKinds", () => {
  it("returns US methods immediately without waiting for ready", () => {
    expect(listExpressCashKinds({ payerCountry: "US", payerState: "CA" })).toEqual([
      "express_card",
      "express_apple_pay",
      "express_google_pay",
      "express_ach",
    ])
  })

  it("hides Stripe when office flags are off", () => {
    expect(listExpressCashKinds({ payerCountry: "US", payerState: "CA", officeEnabled: false })).toEqual([])
  })

  it("hides ACH for EU payers", () => {
    expect(listExpressCashKinds({ payerCountry: "DE" })).toEqual([
      "express_card",
      "express_apple_pay",
      "express_google_pay",
    ])
  })
})

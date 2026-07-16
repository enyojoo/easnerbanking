import { describe, expect, it } from "vitest"
import { deriveTransactionNotification } from "./derive-transaction-notification"

describe("deriveTransactionNotification YC fund_balance", () => {
  it("uses country bank deposit activity label", () => {
    const descriptor = deriveTransactionNotification({
      provider: "yellowcard",
      direction: "in",
      amount: 65,
      currency: "USD",
      metadata: {
        yc_mode: "fund_balance",
        flow: "bank_onramp",
        deposit_display_title: "Nigeria Bank Deposit",
        deposit_review: {
          local_pay_in: 100000,
          local_currency: "NGN",
          usd_credit: 65,
          processing_fee: 0.65,
          exchange_rate: 1538,
          transfer_method: "Bank Transfer",
          credit_to: "USD Balance",
          residence_country: "NG",
          pay_in_rail: "bank_transfer",
        },
      },
      outcome: "success",
    })

    expect(descriptor.pushTitle).toBe("Nigeria bank deposit complete")
    expect(descriptor.pushBody).toContain("credited to your USD balance")
  })

  it("uses MOMO failed headline", () => {
    const descriptor = deriveTransactionNotification({
      provider: "yellowcard",
      direction: "in",
      amount: 65,
      currency: "USD",
      metadata: {
        yc_mode: "fund_balance",
        deposit_display_title: "Nigeria MOMO Deposit",
      },
      outcome: "failed",
    })

    expect(descriptor.pushTitle).toBe("Nigeria MOMO deposit failed")
  })
})

describe("deriveTransactionNotification Noah VA funding", () => {
  it("uses US bank deposit activity label for USD VA funding", () => {
    const descriptor = deriveTransactionNotification({
      provider: "noah",
      direction: "in",
      amount: 100,
      currency: "USD",
      metadata: {
        flow: "bank_onramp",
        fiat_deposit_currency: "USD",
      },
      outcome: "success",
    })

    expect(descriptor.pushTitle).toBe("US bank deposit complete")
  })
})

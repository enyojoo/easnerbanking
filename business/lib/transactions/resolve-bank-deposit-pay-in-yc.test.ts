import { describe, expect, it } from "vitest"
import { resolveBankDepositPayInDetail } from "@/lib/transactions/resolve-bank-deposit-pay-in"

describe("resolveBankDepositPayInDetail YC fund_balance", () => {
  it("reconstructs deposit_review from legacy metadata", () => {
    const resolved = resolveBankDepositPayInDetail({
      provider: "yellowcard",
      status: "pending",
      amount: 65,
      currency: "USD",
      direction: "in",
      metadata: {
        yc_mode: "fund_balance",
        flow: "bank_onramp",
        local_pay_in: 100000,
        local_currency: "NGN",
        usd_credit: 65,
        processing_fee: 0.65,
        pay_in_rail: "bank_transfer",
        residence_country: "NG",
        customer_rate: 1538.46,
        yc_sequence_id: "yc_fb_legacy_1",
      },
    })

    expect(resolved?.depositReview?.local_pay_in).toBe(100000)
    expect(resolved?.depositDisplayTitle).toBe("Nigeria Bank Deposit")
    expect(resolved?.displayHeroTitle).toBe("Nigeria Bank Deposit")
    expect(resolved?.narration).toBeNull()
    expect(resolved?.reference).toBeNull()
    expect(resolved?.sourcePaymentRail).toBe("local_bank")
  })

  it("uses mobile_money rail when pay_in_rail is mobile_money", () => {
    const resolved = resolveBankDepositPayInDetail({
      provider: "yellowcard",
      status: "settled",
      amount: 50,
      currency: "USD",
      direction: "in",
      metadata: {
        yc_mode: "fund_balance",
        flow: "bank_onramp",
        local_pay_in: 80000,
        local_currency: "NGN",
        usd_credit: 50,
        processing_fee: 0.5,
        pay_in_rail: "mobile_money",
        residence_country: "NG",
        deposit_review: {
          local_pay_in: 80000,
          local_currency: "NGN",
          usd_credit: 50,
          processing_fee: 0.5,
          exchange_rate: 1600,
          transfer_method: "Mobile Money",
          credit_to: "USD Balance",
          residence_country: "NG",
          pay_in_rail: "mobile_money",
        },
        deposit_display_title: "Nigeria MOMO Deposit",
      },
    })

    expect(resolved?.sourcePaymentRail).toBe("mobile_money")
    expect(resolved?.depositDisplayTitle).toBe("Nigeria MOMO Deposit")
  })
})

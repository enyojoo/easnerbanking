import { describe, expect, it } from "vitest"
import type { Transaction } from "@/lib/finance-types"
import { resolveTransactionDetailHeroAmount } from "./resolve-transaction-detail-hero"

describe("resolveTransactionDetailHeroAmount", () => {
  it("shows gross deposit amount for relay Tron stablecoin deposits", () => {
    const transaction = {
      direction: "credit",
      amount: 2.31,
      displayCurrency: "USD",
      depositAmount: 3,
      postedAmount: 2.307509,
      postedCurrency: "USD",
    } as unknown as Transaction

    expect(resolveTransactionDetailHeroAmount(transaction)).toEqual({
      amount: 3,
      currency: "USD",
    })
  })

  it("shows local amount paid for a YC fund-balance pay-in", () => {
    const transaction = {
      direction: "credit",
      amount: 100_000,
      displayCurrency: "USD",
      postedAmount: 65,
      postedCurrency: "USD",
      depositReview: {
        local_pay_in: 100_000,
        local_currency: "NGN",
        usd_credit: 65,
      },
    } as unknown as Transaction

    expect(resolveTransactionDetailHeroAmount(transaction)).toEqual({
      amount: 100_000,
      currency: "NGN",
    })
  })

  it("shows the customer payment amount for Stripe collections", () => {
    const transaction = {
      direction: "credit",
      amount: 0.67,
      displayCurrency: "USD",
      depositAmount: 1,
      postedAmount: 0.67,
      postedCurrency: "USD",
    } as unknown as Transaction

    expect(resolveTransactionDetailHeroAmount(transaction)).toEqual({
      amount: 1,
      currency: "USD",
    })
  })
})

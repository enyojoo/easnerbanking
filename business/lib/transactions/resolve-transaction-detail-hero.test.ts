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

  it("shows the credited balance amount for a YC fund-balance pay-in", () => {
    const transaction = {
      direction: "credit",
      amount: 100_000,
      displayCurrency: "NGN",
      postedAmount: 65,
      postedCurrency: "USD",
      depositReview: {
        local_pay_in: 100_000,
        local_currency: "NGN",
        usd_credit: 65,
      },
    } as unknown as Transaction

    expect(resolveTransactionDetailHeroAmount(transaction)).toEqual({
      amount: 65,
      currency: "USD",
    })
  })
})

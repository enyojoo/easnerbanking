import { describe, expect, it } from "vitest"
import { publicAccount, publicTransaction } from "./ledger"

describe("platform public objects", () => {
  it("maps accounts in minor units", () => {
    expect(
      publicAccount({
        id: "acct_1",
        currency: "usd",
        available_cents: 4900,
        pending_cents: 100,
        livemode: false,
      }),
    ).toEqual({
      id: "acct_1",
      currency: "USD",
      available: 4900,
      pending: 100,
      customer: null,
      livemode: false,
    })
    expect(
      publicAccount({
        id: "acct_2",
        currency: "EUR",
        available_cents: 0,
        pending_cents: 0,
        livemode: true,
        customer_id: "cus_1",
      }),
    ).toMatchObject({ customer: "cus_1", currency: "EUR" })
  })

  it("maps transactions without banking fields", () => {
    expect(
      publicTransaction({
        id: "txn_1",
        type: "checkout",
        amount_cents: 4900,
        currency: "usd",
        direction: "in",
        status: "completed",
        account_id: "acct_1",
        livemode: true,
        created_at: "2026-09-20T00:00:00.000Z",
      }),
    ).toMatchObject({
      id: "txn_1",
      amount: 4900,
      currency: "USD",
      account: "acct_1",
      livemode: true,
    })
  })
})

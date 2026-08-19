import { beforeEach, describe, expect, it, vi } from "vitest"
import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"
import { greedyPackSettlements, matchPayoutToSettlements } from "./match-payout-to-settlements"

const balanceTransactionsList = vi.fn()

vi.mock("./client", () => ({
  getStripe: () => ({
    balanceTransactions: { list: balanceTransactionsList },
    charges: { retrieve: vi.fn() },
  }),
}))

type Rows = {
  invoice_stripe_settlements?: Record<string, unknown>[]
  checkout_stripe_settlements?: Record<string, unknown>[]
}

/** Minimal query builder that answers by payment intent for whichever table is asked. */
function mockAdmin(rows: Rows) {
  const admin = {
    from: (table: string) => {
      const tableRows = rows[table as keyof Rows] ?? []
      const filters: Record<string, unknown> = {}
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return builder
        },
        order: () => builder,
        limit: async () => ({
          data: tableRows.filter((row) =>
            Object.entries(filters).every(([col, value]) => row[col] === value),
          ),
        }),
        maybeSingle: async () => ({
          data:
            tableRows.find((row) =>
              Object.entries(filters).every(([col, value]) => row[col] === value),
            ) ?? null,
        }),
      }
      return builder
    },
  }
  return admin as unknown as SupabaseClient
}

const PAYOUT = { id: "po_1", amount: 9_680 } as Stripe.Payout

describe("matchPayoutToSettlements", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("matches a Payment Link collection from the checkout settlement table", async () => {
    balanceTransactionsList.mockResolvedValue({
      has_more: false,
      data: [{ id: "btxn_1", type: "payment", source: { payment_intent: "pi_link" } }],
    })

    const admin = mockAdmin({
      checkout_stripe_settlements: [
        {
          id: "set_link",
          business_id: "biz_1",
          net_cents: 9_680,
          currency: "USD",
          ledger_transaction_id: "txn_link",
          phase: "payment_received",
          stripe_payment_intent_id: "pi_link",
        },
      ],
    })

    const { settlements, byBusiness } = await matchPayoutToSettlements(admin, PAYOUT, {
      stripeAccountId: "acct_1",
    })

    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({
      source: "checkout_stripe",
      settlementId: "set_link",
      invoiceId: null,
      netCents: 9_680,
      balanceTransactionId: "btxn_1",
    })
    expect(byBusiness.get("biz_1")).toHaveLength(1)
  })

  it("still matches invoice settlements and keeps the invoice id", async () => {
    balanceTransactionsList.mockResolvedValue({
      has_more: false,
      data: [{ id: "btxn_2", type: "charge", source: { payment_intent: "pi_invoice" } }],
    })

    const admin = mockAdmin({
      invoice_stripe_settlements: [
        {
          id: "set_inv",
          invoice_id: "inv_1",
          business_id: "biz_1",
          net_cents: 9_680,
          currency: "USD",
          ledger_transaction_id: "txn_inv",
          phase: "payment_received",
          stripe_payment_intent_id: "pi_invoice",
        },
      ],
    })

    const { settlements } = await matchPayoutToSettlements(admin, PAYOUT)

    expect(settlements[0]).toMatchObject({ source: "invoice_stripe", invoiceId: "inv_1" })
  })

  it("skips settlements already credited", async () => {
    balanceTransactionsList.mockResolvedValue({
      has_more: false,
      data: [{ id: "btxn_3", type: "payment", source: { payment_intent: "pi_link" } }],
    })

    const admin = mockAdmin({
      checkout_stripe_settlements: [
        {
          id: "set_link",
          business_id: "biz_1",
          net_cents: 9_680,
          currency: "USD",
          phase: "credited",
          stripe_payment_intent_id: "pi_link",
        },
      ],
    })

    const { settlements } = await matchPayoutToSettlements(admin, PAYOUT)
    expect(settlements).toHaveLength(0)
  })

  it("falls back to pending nets when connected balance txs hide the payment intent", async () => {
    balanceTransactionsList.mockResolvedValue({ has_more: false, data: [] })

    const admin = mockAdmin({
      checkout_stripe_settlements: [
        {
          id: "set_link",
          business_id: "biz_1",
          net_cents: 9_680,
          currency: "USD",
          phase: "payment_received",
          stripe_connected_account_id: "acct_1",
          created_at: "2026-08-18T00:00:00Z",
        },
      ],
    })

    const { settlements } = await matchPayoutToSettlements(admin, PAYOUT, {
      stripeAccountId: "acct_1",
    })

    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({
      source: "checkout_stripe",
      settlementId: "set_link",
      balanceTransactionId: null,
    })
  })
})

describe("greedyPackSettlements", () => {
  it("takes the oldest $1 when packing a $1 inbound", () => {
    const packed = greedyPackSettlements(
      [
        {
          source: "invoice_stripe",
          row: { id: "old", net_cents: 100, created_at: "2026-08-17T00:00:00Z" },
        },
        {
          source: "checkout_stripe",
          row: { id: "new", net_cents: 100, created_at: "2026-08-19T00:00:00Z" },
        },
      ],
      100,
    )
    expect(packed.map((p) => p.row.id)).toEqual(["old"])
  })
})

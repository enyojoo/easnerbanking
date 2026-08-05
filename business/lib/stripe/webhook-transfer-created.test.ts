import { beforeEach, describe, expect, it, vi } from "vitest"
import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("./connect", () => ({
  syncConnectAccountFromWebhook: vi.fn(),
}))
vi.mock("./handle-checkout-completed", () => ({
  handleStripeCheckoutCompleted: vi.fn(),
}))
vi.mock("./handle-payout-paid", () => ({
  handleStripePayoutPaid: vi.fn(),
}))

import { applyStripeWebhookSideEffects } from "./webhook-side-effects"

type SettlementRow = {
  id: string
  phase: string
  stripe_transfer_id: string | null
  ledger_transaction_id: string | null
  stripe_event_ids?: string[]
}

function mockAdmin(opts: {
  settlement: SettlementRow | null
  ledgerMeta?: Record<string, unknown>
}) {
  const settlementUpdates: Record<string, unknown>[] = []
  const ledgerUpdates: Record<string, unknown>[] = []

  const settlementsSelect = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({
      data: opts.settlement
        ? {
            id: opts.settlement.id,
            phase: opts.settlement.phase,
            stripe_transfer_id: opts.settlement.stripe_transfer_id,
            ledger_transaction_id: opts.settlement.ledger_transaction_id,
            stripe_event_ids: opts.settlement.stripe_event_ids ?? [],
          }
        : null,
    })),
  }

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "invoice_stripe_settlements") {
        return {
          select: vi.fn(() => settlementsSelect),
          update: vi.fn((patch: Record<string, unknown>) => {
            settlementUpdates.push(patch)
            return {
              eq: vi.fn(async () => ({ data: null, error: null })),
            }
          }),
        }
      }
      if (table === "transactions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
              data: opts.settlement?.ledger_transaction_id
                ? {
                    id: opts.settlement.ledger_transaction_id,
                    metadata: opts.ledgerMeta ?? {},
                  }
                : null,
            })),
          })),
          update: vi.fn((patch: Record<string, unknown>) => {
            ledgerUpdates.push(patch)
            return {
              eq: vi.fn(async () => ({ data: null, error: null })),
            }
          }),
        }
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: null })),
        })),
      }
    }),
  }

  return {
    admin: admin as unknown as SupabaseClient,
    settlementUpdates,
    ledgerUpdates,
  }
}

describe("transfer.created backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sets stripe_transfer_id on settlement + ledger when charge matches", async () => {
    const { admin, settlementUpdates, ledgerUpdates } = mockAdmin({
      settlement: {
        id: "set_1",
        phase: "payment_received",
        stripe_transfer_id: null,
        ledger_transaction_id: "txn_1",
        stripe_event_ids: ["evt_prior"],
      },
      ledgerMeta: {
        source: "invoice_stripe",
        stripe_charge_id: "ch_123",
      },
    })

    const event = {
      id: "evt_transfer",
      type: "transfer.created",
      data: {
        object: {
          id: "tr_abc",
          source_transaction: "ch_123",
          destination: "acct_connected",
        },
      },
    } as Stripe.Event

    await applyStripeWebhookSideEffects(admin, event)

    expect(settlementUpdates.length).toBeGreaterThanOrEqual(1)
    expect(settlementUpdates[0]).toMatchObject({
      stripe_transfer_id: "tr_abc",
    })
    expect(ledgerUpdates).toHaveLength(1)
    expect(ledgerUpdates[0]).toMatchObject({
      metadata: expect.objectContaining({ stripe_transfer_id: "tr_abc" }),
    })
  })

  it("does not overwrite an existing transfer id", async () => {
    const { admin, settlementUpdates, ledgerUpdates } = mockAdmin({
      settlement: {
        id: "set_1",
        phase: "payment_received",
        stripe_transfer_id: "tr_existing",
        ledger_transaction_id: "txn_1",
      },
      ledgerMeta: { stripe_transfer_id: "tr_existing" },
    })

    const event = {
      id: "evt_transfer_2",
      type: "transfer.created",
      data: {
        object: {
          id: "tr_new",
          source_transaction: "ch_123",
          destination: "acct_connected",
        },
      },
    } as Stripe.Event

    await applyStripeWebhookSideEffects(admin, event)

    // Still appends event id, but should not set a new transfer id
    const transferPatches = settlementUpdates.filter((u) => "stripe_transfer_id" in u)
    expect(transferPatches).toHaveLength(0)
    expect(ledgerUpdates).toHaveLength(0)
  })
})

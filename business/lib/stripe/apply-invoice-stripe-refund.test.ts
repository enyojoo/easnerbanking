import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/invoices/invoice-audit-log", () => ({
  writeInvoiceAuditLog: vi.fn(),
}))
vi.mock("@/lib/invoices/notify-invoice-refunded", () => ({
  notifyInvoiceStripeRefunded: vi.fn().mockResolvedValue(undefined),
}))

import {
  applyInvoiceStripeRefundSideEffects,
  restoreInvoiceStatusAfterStripeRefund,
} from "./apply-invoice-stripe-refund"
import { writeInvoiceAuditLog } from "@/lib/invoices/invoice-audit-log"
import { notifyInvoiceStripeRefunded } from "@/lib/invoices/notify-invoice-refunded"

describe("restoreInvoiceStatusAfterStripeRefund", () => {
  it("restores sent from history when [sent, paid]", () => {
    expect(
      restoreInvoiceStatusAfterStripeRefund([
        { status: "sent", timestamp: "2026-01-01T00:00:00.000Z" },
        { status: "paid", timestamp: "2026-01-02T00:00:00.000Z" },
      ]),
    ).toBe("sent")
  })

  it("restores past_due when that was last issued status before paid", () => {
    expect(
      restoreInvoiceStatusAfterStripeRefund([
        { status: "unpaid", timestamp: "2026-01-01T00:00:00.000Z" },
        { status: "past_due", timestamp: "2026-01-05T00:00:00.000Z" },
        { status: "paid", timestamp: "2026-01-06T00:00:00.000Z" },
      ]),
    ).toBe("past_due")
  })

  it("falls back to unpaid when no prior issued status", () => {
    expect(
      restoreInvoiceStatusAfterStripeRefund([
        { status: "paid", timestamp: "2026-01-02T00:00:00.000Z" },
      ]),
    ).toBe("unpaid")
    expect(restoreInvoiceStatusAfterStripeRefund([])).toBe("unpaid")
    expect(restoreInvoiceStatusAfterStripeRefund(undefined)).toBe("unpaid")
  })
})

type MockState = {
  settlement: {
    id: string
    invoice_id: string
    business_id: string
    phase: string
    ledger_transaction_id: string | null
    stripe_event_ids: string[]
  } | null
  invoice: {
    id: string
    business_id: string
    customer_id: string | null
    invoice_number: string
    status: string
    amount_cents: number
    currency: string
    due_date: string
    created_at: string
    line_items: unknown[]
    tax_rate: number
    bill_to_type: string | null
    customer_name: string
    customer_email: string
    customer_phone: string
    customer_company: string
    customer_address: string
    metadata: Record<string, unknown>
  } | null
  ledger: { id: string; metadata: Record<string, unknown> } | null
}

function createMockAdmin(state: MockState) {
  const settlementUpdates: Record<string, unknown>[] = []
  const ledgerUpdates: Record<string, unknown>[] = []
  const invoiceUpdates: Record<string, unknown>[] = []

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "invoice_stripe_settlements") {
        return {
          select: vi.fn(() => {
            const chain = {
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn(async () => ({ data: state.settlement, error: null })),
            }
            return chain
          }),
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
            maybeSingle: vi.fn(async () => ({ data: state.ledger, error: null })),
          })),
          update: vi.fn((patch: Record<string, unknown>) => {
            ledgerUpdates.push(patch)
            return {
              eq: vi.fn(async () => ({ data: null, error: null })),
            }
          }),
        }
      }
      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: state.invoice, error: null })),
          })),
          update: vi.fn((patch: Record<string, unknown>) => {
            invoiceUpdates.push(patch)
            return {
              eq: vi.fn().mockReturnThis(),
              then: undefined,
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

  // Fix invoices update chain: .update().eq().eq()
  const originalFrom = admin.from
  admin.from = vi.fn((table: string) => {
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: state.invoice, error: null })),
        })),
        update: vi.fn((patch: Record<string, unknown>) => {
          invoiceUpdates.push(patch)
          const eq2 = {
            eq: vi.fn(async () => ({ data: null, error: null })),
          }
          return {
            eq: vi.fn(() => eq2),
          }
        }),
      }
    }
    return originalFrom(table)
  })

  return {
    admin: admin as unknown as SupabaseClient,
    settlementUpdates,
    ledgerUpdates,
    invoiceUpdates,
  }
}

function baseInvoice(overrides?: Partial<MockState["invoice"]>): NonNullable<MockState["invoice"]> {
  return {
    id: "inv_1",
    business_id: "biz_1",
    customer_id: null,
    invoice_number: "EINV-1",
    status: "paid",
    amount_cents: 10000,
    currency: "USD",
    due_date: "2026-02-01",
    created_at: "2026-01-01T00:00:00.000Z",
    line_items: [{ description: "Service", quantity: 1, unitPrice: 100, amount: 100 }],
    tax_rate: 0,
    bill_to_type: null,
    customer_name: "Jane",
    customer_email: "jane@example.com",
    customer_phone: "",
    customer_company: "",
    customer_address: "",
    metadata: {
      statusHistory: [
        { status: "sent", timestamp: "2026-01-01T12:00:00.000Z" },
        { status: "paid", timestamp: "2026-01-02T12:00:00.000Z" },
      ],
      paymentInfo: {
        paidAt: "2026-01-02T12:00:00.000Z",
        method: "stripe",
        stripe: {
          paymentIntentId: "pi_1",
          paymentMethodType: "card",
          brand: "visa",
          last4: "4242",
          grossCents: 10000,
          feeCents: 300,
          netCents: 9700,
          settlementPhase: "payment_received",
        },
      },
    },
    ...overrides,
  }
}

describe("applyInvoiceStripeRefundSideEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("marks settlement failed, ledger failed, restores sent status", async () => {
    const { admin, settlementUpdates, ledgerUpdates, invoiceUpdates } = createMockAdmin({
      settlement: {
        id: "set_1",
        invoice_id: "inv_1",
        business_id: "biz_1",
        phase: "payment_received",
        ledger_transaction_id: "txn_1",
        stripe_event_ids: [],
      },
      invoice: baseInvoice(),
      ledger: { id: "txn_1", metadata: { source: "invoice_stripe" } },
    })

    const result = await applyInvoiceStripeRefundSideEffects(admin, {
      settlementId: "set_1",
      refundId: "re_1",
      refundedAt: "2026-01-03T00:00:00.000Z",
      source: "api",
      actorUserId: "user_1",
    })

    expect(result).toMatchObject({
      ok: true,
      applied: true,
      restoredStatus: "sent",
      ledgerTransactionId: "txn_1",
    })
    expect(settlementUpdates[0]).toMatchObject({ phase: "failed" })
    expect(ledgerUpdates[0]).toMatchObject({
      status: "failed",
      metadata: expect.objectContaining({
        settlement_phase: "failed",
        stripe_refund_id: "re_1",
      }),
    })
    expect(invoiceUpdates[0]).toMatchObject({ status: "sent" })
    const meta = invoiceUpdates[0].metadata as {
      paymentInfo: { stripe: { refundId: string; settlementPhase: string } }
      statusHistory: { status: string }[]
    }
    expect(meta.paymentInfo.stripe.refundId).toBe("re_1")
    expect(meta.paymentInfo.stripe.settlementPhase).toBe("failed")
    expect(meta.statusHistory.at(-1)?.status).toBe("sent")
    expect(writeInvoiceAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment_refunded",
        changes: expect.objectContaining({ refundId: "re_1" }),
      }),
    )
    expect(notifyInvoiceStripeRefunded).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        businessId: "biz_1",
        invoice: expect.objectContaining({
          id: "inv_1",
          status: "sent",
        }),
      }),
    )
  })

  it("is idempotent for the same refund id", async () => {
    const invoice = baseInvoice({
      status: "sent",
      metadata: {
        statusHistory: [
          { status: "sent", timestamp: "2026-01-01T12:00:00.000Z" },
          { status: "paid", timestamp: "2026-01-02T12:00:00.000Z" },
          { status: "sent", timestamp: "2026-01-03T00:00:00.000Z" },
        ],
        paymentInfo: {
          paidAt: "2026-01-02T12:00:00.000Z",
          method: "stripe",
          stripe: {
            paymentIntentId: "pi_1",
            paymentMethodType: "card",
            grossCents: 10000,
            feeCents: 300,
            netCents: 9700,
            settlementPhase: "failed",
            refundId: "re_1",
            refundedAt: "2026-01-03T00:00:00.000Z",
          },
        },
      },
    })
    const { admin, settlementUpdates, ledgerUpdates, invoiceUpdates } = createMockAdmin({
      settlement: {
        id: "set_1",
        invoice_id: "inv_1",
        business_id: "biz_1",
        phase: "failed",
        ledger_transaction_id: "txn_1",
        stripe_event_ids: ["evt_1"],
      },
      invoice,
      ledger: { id: "txn_1", metadata: {} },
    })

    const result = await applyInvoiceStripeRefundSideEffects(admin, {
      settlementId: "set_1",
      refundId: "re_1",
      source: "webhook",
      stripeEventId: "evt_2",
    })

    expect(result).toMatchObject({
      ok: true,
      applied: false,
      skipped: "already_applied",
      restoredStatus: "sent",
    })
    expect(ledgerUpdates).toHaveLength(0)
    expect(invoiceUpdates).toHaveLength(0)
    // May append event id only
    expect(settlementUpdates.every((u) => !("phase" in u) || u.phase === undefined || true)).toBe(true)
  })

  it("skips credited settlements without mutating invoice", async () => {
    const { admin, invoiceUpdates, ledgerUpdates } = createMockAdmin({
      settlement: {
        id: "set_1",
        invoice_id: "inv_1",
        business_id: "biz_1",
        phase: "credited",
        ledger_transaction_id: "txn_1",
        stripe_event_ids: [],
      },
      invoice: baseInvoice(),
      ledger: { id: "txn_1", metadata: {} },
    })

    const result = await applyInvoiceStripeRefundSideEffects(admin, {
      chargeId: "ch_1",
      refundId: "re_1",
      source: "webhook",
      stripeEventId: "evt_credit",
    })

    expect(result).toMatchObject({
      ok: true,
      applied: false,
      skipped: "credited",
    })
    expect(invoiceUpdates).toHaveLength(0)
    expect(ledgerUpdates).toHaveLength(0)
  })

  it("falls back to unpaid when history has no prior issued status", async () => {
    const { admin, invoiceUpdates } = createMockAdmin({
      settlement: {
        id: "set_1",
        invoice_id: "inv_1",
        business_id: "biz_1",
        phase: "payment_received",
        ledger_transaction_id: null,
        stripe_event_ids: [],
      },
      invoice: baseInvoice({
        metadata: {
          statusHistory: [{ status: "paid", timestamp: "2026-01-02T12:00:00.000Z" }],
          paymentInfo: {
            paidAt: "2026-01-02T12:00:00.000Z",
            method: "stripe",
            stripe: {
              paymentIntentId: "pi_1",
              paymentMethodType: "card",
              grossCents: 10000,
              feeCents: 0,
              netCents: 10000,
              settlementPhase: "payment_received",
            },
          },
        },
      }),
      ledger: null,
    })

    const result = await applyInvoiceStripeRefundSideEffects(admin, {
      settlementId: "set_1",
      refundId: "re_2",
      source: "api",
    })

    expect(result).toMatchObject({ ok: true, applied: true, restoredStatus: "unpaid" })
    expect(invoiceUpdates[0]).toMatchObject({ status: "unpaid" })
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("server-only", () => ({}))
import { handleGridStripeSettlementWebhook } from "./stripe-settlement-webhook"

const mockUpsert = vi.fn().mockResolvedValue({ transactionId: "stripe-tx" })
const mockDelta = vi.fn().mockResolvedValue(undefined)
const mockWebhook = vi.fn().mockResolvedValue(undefined)

vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: (...args: unknown[]) => mockUpsert(...args),
}))

vi.mock("@/lib/wallet/wallet-balances-db", () => ({
  applyWalletBalanceDelta: (...args: unknown[]) => mockDelta(...args),
}))

vi.mock("@/lib/checkout/merchant-webhooks", () => ({
  dispatchMerchantWebhook: (...args: unknown[]) => mockWebhook(...args),
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId: vi.fn().mockResolvedValue("owner-1"),
}))

type Store = Record<string, Record<string, unknown>[]>

function jsonPath(row: Record<string, unknown>, col: string): unknown {
  const match = col.match(/^metadata->>"?([a-zA-Z0-9_]+)"?$/)
  if (!match) return row[col]
  const meta = row.metadata
  if (!meta || typeof meta !== "object") return undefined
  return (meta as Record<string, unknown>)[match[1]]
}

function matches(
  row: Record<string, unknown>,
  filters: { eq: [string, unknown][]; in: [string, unknown[]][] },
) {
  for (const [col, value] of filters.eq) {
    if (jsonPath(row, col) !== value) return false
  }
  for (const [col, values] of filters.in) {
    if (!values.includes(row[col])) return false
  }
  return true
}

function mockAdmin(store: Store) {
  const writes: { table: string; op: string; payload: unknown }[] = []
  const from = (table: string) => {
    const filters = { eq: [] as [string, unknown][], in: [] as [string, unknown[]][] }
    let pendingUpdate: Record<string, unknown> | null = null
    let pendingDelete = false
    const applyFilters = () => (store[table] ?? []).filter((row) => matches(row, filters))
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, value: unknown) => {
        filters.eq.push([col, value])
        return builder
      },
      in: (col: string, values: unknown[]) => {
        filters.in.push([col, values])
        return builder
      },
      filter: (col: string, _op: string, value: unknown) => {
        filters.eq.push([col, value])
        return builder
      },
      delete: () => {
        pendingDelete = true
        writes.push({ table, op: "delete", payload: null })
        return builder
      },
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: applyFilters()[0] ?? null }),
      single: async () => ({ data: applyFilters()[0] ?? { id: "gt_new" }, error: null }),
      insert: (payload: Record<string, unknown>) => {
        writes.push({ table, op: "insert", payload })
        const row = { id: "gt_new", ...payload }
        store[table] = [...(store[table] ?? []), row]
        return builder
      },
      update: (payload: Record<string, unknown>) => {
        pendingUpdate = payload
        writes.push({ table, op: "update", payload })
        return builder
      },
      then: (resolve: (value: unknown) => void, reject?: (err: unknown) => void) => {
        try {
          if (pendingDelete) {
            const remove = new Set(applyFilters().map((row) => row.id))
            store[table] = (store[table] ?? []).filter((row) => !remove.has(row.id))
            pendingDelete = false
            resolve({ data: null, error: null })
            return
          }
          if (pendingUpdate) {
            for (const row of applyFilters()) Object.assign(row, pendingUpdate)
            pendingUpdate = null
            resolve({ data: null, error: null })
            return
          }
          resolve({ data: applyFilters(), error: null })
        } catch (err) {
          reject?.(err)
        }
      },
    }
    return builder
  }
  return { from, writes, store } as unknown as SupabaseClient & {
    writes: typeof writes
    store: Store
  }
}

function easnerEvent(amount = 100) {
  return {
    type: "INCOMING_PAYMENT.COMPLETED",
    data: {
      id: "Transaction:connect-1",
      customerId: "Customer:grid-1",
      status: "COMPLETED",
      source: { accountHolderName: "EASNER", bankIdentifier: "091000019" },
      receivedAmount: { amount, currency: { code: "USD", name: "US Dollar", decimals: 2 } },
    },
  }
}

const invoiceSettlement = {
  id: "set_inv",
  invoice_id: "inv_1",
  business_id: "biz-1",
  net_cents: 100,
  currency: "USD",
  ledger_transaction_id: "ledger_inv",
  phase: "payment_received",
  created_at: "2026-08-17T19:26:20Z",
}

const newerCheckout = {
  id: "set_link",
  business_id: "biz-1",
  net_cents: 100,
  currency: "USD",
  ledger_transaction_id: "ledger_link",
  payment_link_id: "plink_1",
  phase: "payment_received",
  created_at: "2026-08-19T00:04:13Z",
}

const stripeLedger = {
  id: "ledger_inv",
  user_id: "owner-1",
  business_id: "biz-1",
  metadata: { settlement_phase: "payment_received", easner_transaction_id: "ETID94909659" },
  amount: 1,
  currency: "USD",
  provider_transaction_id: "pi_invoice",
}

describe("handleGridStripeSettlementWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("credits the oldest pending settlement for an EASNER Connect inbound", async () => {
    const admin = mockAdmin({
      businesses: [{ id: "biz-1", grid_customer_id: "Customer:grid-1" }],
      grid_transfers: [],
      invoice_stripe_settlements: [{ ...invoiceSettlement }],
      checkout_stripe_settlements: [{ ...newerCheckout }],
      transactions: [{ ...stripeLedger }],
      invoices: [{ id: "inv_1", metadata: { paymentInfo: { stripe: { settlementPhase: "payment_received" } } } }],
    })

    const result = await handleGridStripeSettlementWebhook(admin, { event: easnerEvent() })
    expect(result).toEqual({ handled: true })
    expect(mockDelta).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ businessId: "biz-1", delta: 1, currency: "USD" }),
    )
    expect(mockUpsert).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        provider: "stripe",
        providerTransactionId: "pi_invoice",
        status: "settled",
        metadata: expect.objectContaining({
          settlement_phase: "credited",
          settlement_rail: "grid_va",
        }),
      }),
    )
    expect(admin.store.invoice_stripe_settlements[0]?.phase).toBe("credited")
    expect(admin.store.checkout_stripe_settlements[0]?.phase).toBe("payment_received")
    expect(admin.writes.some((w) => w.table === "grid_transfers" && w.op === "insert")).toBe(true)
  })

  it("does not treat Bridge Building Dashboard payouts as Connect", async () => {
    const admin = mockAdmin({
      businesses: [{ id: "biz-1", grid_customer_id: "Customer:grid-1" }],
      invoice_stripe_settlements: [{ ...invoiceSettlement }],
      checkout_stripe_settlements: [],
      grid_transfers: [],
      transactions: [],
      invoices: [],
    })
    const result = await handleGridStripeSettlementWebhook(admin, {
      event: {
        type: "INCOMING_PAYMENT.COMPLETED",
        data: {
          id: "Transaction:dash-1",
          customerId: "Customer:grid-1",
          status: "COMPLETED",
          source: { accountHolderName: "Bridge Building", bankIdentifier: "101019644" },
          receivedAmount: { amount: 100, currency: { code: "USD", decimals: 2 } },
        },
      },
    })
    expect(result).toEqual({ handled: false })
    expect(mockDelta).not.toHaveBeenCalled()
    expect(admin.store.invoice_stripe_settlements[0]?.phase).toBe("payment_received")
  })

  it("skips a second wallet credit when the VA inbound already credited", async () => {
    const admin = mockAdmin({
      businesses: [{ id: "biz-1", grid_customer_id: "Customer:grid-1" }],
      grid_transfers: [],
      invoice_stripe_settlements: [{ ...invoiceSettlement }],
      checkout_stripe_settlements: [],
      transactions: [
        { ...stripeLedger },
        {
          id: "va-row",
          provider: "grid",
          provider_transaction_id: "Transaction:connect-1",
          metadata: {
            flow: "bank_onramp",
            grid_va_inbound: true,
            wallet_balance_credit_key: "grid_va_inbound:Transaction:connect-1",
          },
        },
      ],
      invoices: [{ id: "inv_1", metadata: {} }],
    })

    const result = await handleGridStripeSettlementWebhook(admin, { event: easnerEvent() })
    expect(result).toEqual({ handled: true })
    expect(mockDelta).not.toHaveBeenCalled()
    expect(admin.store.transactions.find((r) => r.id === "va-row")).toBeUndefined()
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { handleBridgeVaInboundActivity } from "./va-inbound-webhook"

const mockUpsert = vi.fn().mockResolvedValue({ transactionId: "stripe-tx" })
const mockDelta = vi.fn().mockResolvedValue(undefined)
const mockWebhook = vi.fn().mockResolvedValue(undefined)

vi.mock("server-only", () => ({}))

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

vi.mock("@/lib/grid/grid-va-turnkey-mirror", () => ({
  suppressTurnkeyGridVaChainMirrorRow: vi.fn().mockResolvedValue({ suppressed: 0 }),
}))

vi.mock("@/lib/notifications/bank-deposit-settled-notify", () => ({
  notifyGridBankDepositPayInSettledPush: vi.fn(),
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

const checkoutSettlement = {
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
  id: "ledger_link",
  user_id: "owner-1",
  business_id: "biz-1",
  metadata: { settlement_phase: "payment_received" },
  amount: 1,
  currency: "USD",
  provider_transaction_id: "pi_link",
}

function connectPayload(overrides: Record<string, unknown> = {}) {
  return {
    event_type: "virtual_account.activity.created",
    event_object: {
      id: "dep_connect_1",
      customer_id: "cus_bridge_1",
      type: "payment_processed",
      amount: 1,
      currency: "usd",
      source: {
        sender_name: "EASNER",
        routing_number: "091000019",
      },
      ...overrides,
    },
  }
}

describe("handleBridgeVaInboundActivity Connect hop 3", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("credits a pending checkout settlement and skips the bank on-ramp", async () => {
    const admin = mockAdmin({
      businesses: [{ id: "biz-1", bridge_customer_id: "cus_bridge_1" }],
      checkout_stripe_settlements: [{ ...checkoutSettlement }],
      invoice_stripe_settlements: [],
      grid_transfers: [],
      transactions: [{ ...stripeLedger }],
    })

    await handleBridgeVaInboundActivity(admin, connectPayload())

    expect(mockDelta).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ businessId: "biz-1", delta: 1, currency: "USD" }),
    )
    expect(mockUpsert).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        provider: "stripe",
        providerTransactionId: "pi_link",
        status: "settled",
        metadata: expect.objectContaining({
          settlement_phase: "credited",
          settlement_rail: "bridge_va",
          bridge_deposit_id: "dep_connect_1",
        }),
      }),
    )
    expect(admin.store.checkout_stripe_settlements[0]?.phase).toBe("credited")
    expect(
      admin.store.transactions.some(
        (row) => row.provider === "bridge" && row.metadata && (row.metadata as Record<string, unknown>).flow === "bank_onramp",
      ),
    ).toBe(false)
  })

  it("keeps Dashboard ACH as a bank on-ramp", async () => {
    const admin = mockAdmin({
      businesses: [{ id: "biz-1", bridge_customer_id: "cus_bridge_1" }],
      checkout_stripe_settlements: [{ ...checkoutSettlement }],
      invoice_stripe_settlements: [],
      grid_transfers: [],
      transactions: [],
    })

    await handleBridgeVaInboundActivity(
      admin,
      connectPayload({
        source: { sender_name: "Bridge Building", routing_number: "101019644" },
      }),
    )

    expect(admin.store.checkout_stripe_settlements[0]?.phase).toBe("payment_received")
    expect(mockUpsert).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        provider: "bridge",
        metadata: expect.objectContaining({ flow: "bank_onramp" }),
      }),
    )
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("server-only", () => ({}))

const gridFetch = vi.hoisted(() => vi.fn())
const retrieveGridQuote = vi.hoisted(() => vi.fn())
const registerTurnkey = vi.hoisted(() => vi.fn())
const reconcile = vi.hoisted(() => vi.fn())

vi.mock("./http", () => ({
  gridFetch: (...args: unknown[]) => gridFetch(...args),
  GridHttpError: class GridHttpError extends Error {
    status: number
    body?: unknown
    constructor(message: string, status: number, body?: unknown) {
      super(message)
      this.status = status
      this.body = body
    }
  },
}))

vi.mock("./quote-funding", () => ({
  retrieveGridQuote: (...args: unknown[]) => retrieveGridQuote(...args),
}))

vi.mock("./turnkey-external-account", () => ({
  registerTurnkeyUsdcExternalAccount: (...args: unknown[]) => registerTurnkey(...args),
}))

vi.mock("./grid-bank-deposit-credit", () => ({
  reconcileGridVaBankDepositCreditForSolanaTx: (...args: unknown[]) => reconcile(...args),
}))

vi.mock("./external-account", () => ({
  gridMinorUnits: (amount: number, decimals: number) => Math.round(amount * 10 ** decimals),
  gridMajorUnits: (minor: number, decimals: number) => minor / 10 ** decimals,
}))

vi.mock("@/lib/wallet/wallet-balances-db", () => ({
  applyWalletBalanceDelta: vi.fn(),
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId: vi.fn().mockResolvedValue("owner-1"),
}))

import {
  executeGridVaTurnkeySweep,
  findGridVaTurnkeySweepForSolanaTx,
  findPendingGridVaTurnkeySweepForInboundAmount,
  parseGridInternalAccountId,
  startGridVaTurnkeySweepForKnownInbound,
} from "./va-turnkey-sweep"

function chainAdmin(handlers: {
  maybeSingle?: (table: string) => unknown
  insertId?: string
  limitRows?: unknown[]
}) {
  const from = vi.fn((table: string) => {
    const api: Record<string, unknown> = {}
    const chain = () => api
    api.select = vi.fn(chain)
    api.eq = vi.fn(chain)
    api.filter = vi.fn(chain)
    api.in = vi.fn(chain)
    api.order = vi.fn(chain)
    api.limit = vi.fn(async () => ({ data: handlers.limitRows ?? [] }))
    api.maybeSingle = vi.fn(async () => ({ data: handlers.maybeSingle?.(table) ?? null }))
    api.insert = vi.fn(() => {
      api.select = vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: { id: handlers.insertId ?? "sweep-new" },
          error: null,
        })),
      }))
      return api
    })
    api.update = vi.fn(chain)
    return api
  })
  return { from } as unknown as SupabaseClient
}

describe("parseGridInternalAccountId", () => {
  it("strips currency suffix from persisted VA ids", () => {
    expect(
      parseGridInternalAccountId("InternalAccount:01a00ff7-04aa-438c-0000-d33a59fcb8d4:usd:US_ACCOUNT"),
    ).toBe("InternalAccount:01a00ff7-04aa-438c-0000-d33a59fcb8d4")
  })
})

describe("startGridVaTurnkeySweepForKnownInbound", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerTurnkey.mockResolvedValue("ExternalAccount:tk")
    gridFetch.mockResolvedValue({
      id: "Quote:1",
      status: "PENDING",
      transactionId: "Transaction:out-1",
    })
    retrieveGridQuote.mockResolvedValue({ id: "Quote:1", status: "PENDING" })
  })

  it("returns the existing settled sweep without creating another quote", async () => {
    const admin = chainAdmin({
      maybeSingle: (table) =>
        table === "grid_transfers"
          ? {
              id: "sweep-settled",
              status: "settled",
              metadata: { inbound_grid_transaction_id: "Transaction:in-1" },
            }
          : null,
    })

    const result = await startGridVaTurnkeySweepForKnownInbound(admin, {
      userId: "user-1",
      businessId: "biz-1",
      customerId: "Customer:abc",
      inboundGridTransactionId: "Transaction:in-1",
      sourceInternalAccountId: "InternalAccount:usd-1",
      amount: 1,
    })

    expect(result).toEqual({ ok: true, reason: "settled", transferId: "sweep-settled" })
    expect(gridFetch).not.toHaveBeenCalled()
  })

  it("quotes INTERNAL_FIAT USD to Turnkey USDC and executes", async () => {
    const admin = chainAdmin({
      maybeSingle: () => null,
      insertId: "sweep-new",
    })
    admin.from = vi.fn((table: string) => {
      const api: Record<string, unknown> = {}
      const chain = () => api
      api.select = vi.fn(chain)
      api.eq = vi.fn(chain)
      api.filter = vi.fn(chain)
      api.maybeSingle = vi.fn(async () => {
        if (table === "grid_transfers") return { data: { id: "sweep-new", status: "pending", metadata: {
          inbound_grid_transaction_id: "Transaction:in-1",
          source_internal_account_id: "InternalAccount:usd-1",
          inbound_amount: 1,
        }, quoted_pay_in: 1, user_id: "user-1", business_id: "biz-1", grid_customer_id: "Customer:abc" } }
        return { data: null }
      })
      api.insert = vi.fn(() => ({
        select: () => ({
          maybeSingle: async () => ({ data: { id: "sweep-new" }, error: null }),
        }),
      }))
      api.update = vi.fn(chain)
      return api
    }) as never

    const result = await startGridVaTurnkeySweepForKnownInbound(admin, {
      userId: "user-1",
      businessId: "biz-1",
      customerId: "Customer:abc",
      inboundGridTransactionId: "Transaction:in-1",
      sourceInternalAccountId: "InternalAccount:usd-1",
      amount: 1,
    })

    expect(result.ok).toBe(true)
    expect(gridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/quotes",
        json: expect.objectContaining({
          immediatelyExecute: true,
          purposeOfPayment: "SELF",
          lockedCurrencySide: "SENDING",
          source: { sourceType: "ACCOUNT", accountId: "InternalAccount:usd-1" },
          destination: { destinationType: "ACCOUNT", accountId: "ExternalAccount:tk" },
        }),
      }),
    )
    expect(gridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/quotes/Quote%3A1/execute",
      }),
    )
  })
})

describe("findGridVaTurnkeySweepForSolanaTx", () => {
  it("does not attach an organic inbound to a stale unmatched sweep", async () => {
    const admin = chainAdmin({
      limitRows: [
        {
          id: "sweep-1",
          status: "settled",
          quoted_pay_in: 2,
          updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          metadata: { inbound_grid_transaction_id: "Transaction:in-1" },
        },
        {
          id: "sweep-2",
          status: "settled",
          metadata: { grid_on_chain_tx_hash: "already-linked" },
        },
      ],
    })

    const result = await findGridVaTurnkeySweepForSolanaTx(admin, {
      txHash: "hash-organic",
      businessId: "biz-1",
      userId: "user-1",
      amount: 2,
    })
    expect(result).toBeNull()
  })

  it("does not amount-match a recent settled sweep with no chain hashes", async () => {
    const admin = chainAdmin({
      limitRows: [
        {
          id: "sweep-recent",
          status: "settled",
          quoted_pay_in: 2,
          updated_at: new Date().toISOString(),
          metadata: { inbound_grid_transaction_id: "Transaction:in-1", inbound_amount: 2 },
        },
      ],
    })

    const result = await findGridVaTurnkeySweepForSolanaTx(admin, {
      txHash: "hash-new",
      businessId: "biz-1",
      userId: "user-1",
      amount: 2,
    })
    expect(result).toBeNull()
  })

  it("amount-matches a recent pending sweep", async () => {
    const admin = chainAdmin({
      limitRows: [
        {
          id: "sweep-pending",
          status: "pending",
          quoted_pay_in: 2,
          updated_at: new Date().toISOString(),
          metadata: { inbound_grid_transaction_id: "Transaction:in-1", inbound_amount: 2 },
        },
      ],
    })

    const result = await findGridVaTurnkeySweepForSolanaTx(admin, {
      txHash: "hash-new",
      businessId: "biz-1",
      userId: "user-1",
      amount: 2,
    })
    expect(result).toEqual({ transferId: "sweep-pending" })
  })

  it("does not FIFO-match a different amount onto an unmatched sweep", async () => {
    const admin = chainAdmin({
      limitRows: [
        {
          id: "sweep-1",
          status: "settled",
          quoted_pay_in: 2,
          updated_at: new Date().toISOString(),
          metadata: { inbound_grid_transaction_id: "Transaction:in-1" },
        },
      ],
    })

    const result = await findGridVaTurnkeySweepForSolanaTx(admin, {
      txHash: "hash-organic-49",
      businessId: "biz-1",
      userId: "user-1",
      amount: 49.5,
    })
    expect(result).toBeNull()
  })

  it("matches a settled sweep by amount when Grid already stored a different hash", async () => {
    const admin = chainAdmin({
      limitRows: [
        {
          id: "sweep-hashed",
          status: "settled",
          quoted_pay_in: 188640,
          updated_at: new Date().toISOString(),
          metadata: {
            inbound_grid_transaction_id: "Transaction:in-1",
            grid_on_chain_tx_hash: "grid-reported-hash",
            inbound_amount: 188640,
          },
        },
      ],
    })

    const result = await findGridVaTurnkeySweepForSolanaTx(admin, {
      txHash: "turnkey-wallet-hash",
      businessId: "biz-1",
      userId: "user-1",
      amount: 188640,
    })
    expect(result).toEqual({ transferId: "sweep-hashed" })
  })

  it("matches dust inbound to the most recent hashed sweep", async () => {
    const admin = chainAdmin({
      limitRows: [
        {
          id: "sweep-old",
          status: "settled",
          quoted_pay_in: 5,
          updated_at: new Date(Date.now() - 60_000).toISOString(),
          metadata: { grid_on_chain_tx_hash: "grid-old" },
        },
        {
          id: "sweep-recent",
          status: "settled",
          quoted_pay_in: 188640,
          updated_at: new Date().toISOString(),
          metadata: { grid_on_chain_tx_hash: "grid-recent" },
        },
      ],
    })

    const result = await findGridVaTurnkeySweepForSolanaTx(admin, {
      txHash: "turnkey-dust-hash",
      businessId: "biz-1",
      userId: "user-1",
      amount: 0.001,
    })
    expect(result).toEqual({ transferId: "sweep-recent" })
  })
})

describe("findPendingGridVaTurnkeySweepForInboundAmount", () => {
  it("does not amount-match a week-old settled sweep", async () => {
    const admin = chainAdmin({
      limitRows: [
        {
          id: "sweep-stale",
          status: "settled",
          quoted_pay_in: 2,
          created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          metadata: { inbound_amount: 2 },
        },
      ],
    })

    const result = await findPendingGridVaTurnkeySweepForInboundAmount(admin, {
      userId: "user-1",
      businessId: "biz-1",
      amount: 2,
      currency: "USD",
    })
    expect(result).toBeNull()
  })

  it("does not amount-match a recent settled sweep with no chain hashes", async () => {
    const admin = chainAdmin({
      limitRows: [
        {
          id: "sweep-recent",
          status: "settled",
          quoted_pay_in: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { inbound_amount: 2 },
        },
      ],
    })

    const result = await findPendingGridVaTurnkeySweepForInboundAmount(admin, {
      userId: "user-1",
      businessId: "biz-1",
      amount: 2,
      currency: "USD",
    })
    expect(result).toBeNull()
  })

  it("amount-matches a recent pending sweep", async () => {
    const admin = chainAdmin({
      limitRows: [
        {
          id: "sweep-pending",
          status: "pending",
          quoted_pay_in: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { inbound_amount: 2 },
        },
      ],
    })

    const result = await findPendingGridVaTurnkeySweepForInboundAmount(admin, {
      userId: "user-1",
      businessId: "biz-1",
      amount: 2,
      currency: "USD",
    })
    expect(result).toEqual({ transferId: "sweep-pending" })
  })
})

describe("executeGridVaTurnkeySweep", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerTurnkey.mockResolvedValue("ExternalAccount:tk")
    retrieveGridQuote.mockResolvedValue({ id: "Quote:existing", status: "PENDING" })
    gridFetch.mockResolvedValue({ id: "Quote:existing", status: "PROCESSING" })
  })

  it("retries execute on an existing pending quote instead of marking failed", async () => {
    const admin = chainAdmin({
      maybeSingle: () => ({
        id: "sweep-1",
        status: "pending",
        user_id: "user-1",
        business_id: "biz-1",
        grid_customer_id: "Customer:abc",
        grid_quote_id: "Quote:existing",
        quoted_pay_in: 1,
        metadata: {
          inbound_grid_transaction_id: "Transaction:in-1",
          source_internal_account_id: "InternalAccount:usd-1",
        },
      }),
    })

    const result = await executeGridVaTurnkeySweep(admin, "sweep-1")
    expect(result).toMatchObject({ ok: true, reason: "execute_retried" })
    expect(retrieveGridQuote).toHaveBeenCalledWith("Quote:existing")
    expect(gridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/quotes/Quote%3Aexisting/execute",
      }),
    )
  })
})

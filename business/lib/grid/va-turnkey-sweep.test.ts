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

vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId: vi.fn().mockResolvedValue("owner-1"),
}))

import {
  executeGridVaTurnkeySweep,
  findGridVaTurnkeySweepForSolanaTx,
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
  it("returns the oldest settled sweep still missing an on-chain hash", async () => {
    const admin = chainAdmin({
      limitRows: [
        {
          id: "sweep-1",
          status: "settled",
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
      txHash: "hash-new",
      businessId: "biz-1",
      userId: "user-1",
    })
    expect(result).toEqual({ transferId: "sweep-1" })
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

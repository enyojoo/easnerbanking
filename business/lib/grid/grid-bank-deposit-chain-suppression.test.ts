import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/notifications/bank-deposit-settled-notify", () => ({
  notifyGridBankDepositPayInSettledPush: vi.fn(),
}))
vi.mock("./grid-bank-deposit-credit", () => ({
  isGridVaBankDepositMetadata: (metadata: unknown) => {
    if (!metadata || typeof metadata !== "object") return false
    const meta = metadata as Record<string, unknown>
    return meta.flow === "bank_onramp" && meta.payout_provider === "grid" && meta.grid_va_inbound === true
  },
}))

import { findGridVaBankDepositChainSettlementForSuppression } from "./grid-bank-deposit-chain-suppression"

function makeAdmin(rowsByHash: Array<{ id: string; metadata: unknown }>, payInRow: { id: string; metadata: unknown } | null) {
  const from = vi.fn((table: string) => {
    void table
    let stage: "hash" | "meta" = "hash"
    const query: Record<string, unknown> = {}
    const api = {
      select: vi.fn(() => api),
      eq: vi.fn((col: string, val: string) => {
        query[col] = val
        return api
      }),
      is: vi.fn(() => api),
      filter: vi.fn((col: string) => {
        if (String(col).includes("grid_on_chain_tx_hash")) stage = "meta"
        return api
      }),
      limit: vi.fn(async () => ({
        data: stage === "hash" ? rowsByHash : payInRow ? [payInRow] : [],
      })),
      maybeSingle: vi.fn(async () => ({ data: payInRow })),
    }
    return api
  })
  return { from } as unknown as SupabaseClient
}

describe("findGridVaBankDepositChainSettlementForSuppression", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("matches Grid VA deposit by on-chain tx hash", async () => {
    const admin = makeAdmin(
      [
        {
          id: "tx-grid-1",
          metadata: { flow: "bank_onramp", payout_provider: "grid", grid_va_inbound: true },
        },
      ],
      null,
    )
    const found = await findGridVaBankDepositChainSettlementForSuppression(admin, {
      txHash: "sig123",
      userId: "user-1",
      businessId: "biz-1",
    })
    expect(found).toEqual({ linkedTransactionId: "tx-grid-1" })
  })

  it("returns null when no matching Grid VA deposit exists", async () => {
    const admin = makeAdmin([], null)
    const found = await findGridVaBankDepositChainSettlementForSuppression(admin, {
      txHash: "sig-missing",
      userId: "user-1",
      businessId: "biz-1",
    })
    expect(found).toBeNull()
  })
})

describe("findPendingGridVaBankDepositForInboundAmount", () => {
  it("matches a credited VA deposit that still has no on-chain hash", async () => {
    const { findPendingGridVaBankDepositForInboundAmount } = await import("./grid-bank-deposit-chain-suppression")
    const rows = [
      {
        id: "tx-credited",
        amount: 1,
        currency: "USD",
        provider_transaction_id: "Transaction:in-1",
        tx_hash: null,
        metadata: {
          flow: "bank_onramp",
          payout_provider: "grid",
          grid_va_inbound: true,
          wallet_balance_credit_key: "grid_va_inbound:Transaction:in-1",
          wallet_ledger_currency: "USD",
        },
      },
    ]
    const from = vi.fn(() => {
      const api: Record<string, unknown> = {}
      const chain = () => api
      api.select = vi.fn(chain)
      api.eq = vi.fn(chain)
      api.is = vi.fn(chain)
      api.filter = vi.fn(chain)
      api.gte = vi.fn(chain)
      api.order = vi.fn(chain)
      api.limit = vi.fn(async () => ({ data: rows }))
      return api
    })
    const found = await findPendingGridVaBankDepositForInboundAmount(
      { from } as unknown as SupabaseClient,
      { userId: "user-1", businessId: "biz-1", amount: 1, currency: "USD" },
    )
    expect(found).toEqual({
      transactionId: "tx-credited",
      gridTransactionId: "Transaction:in-1",
    })
  })

  it("matches a credited VA deposit even after Grid stored a different on-chain hash", async () => {
    const { findPendingGridVaBankDepositForInboundAmount } = await import("./grid-bank-deposit-chain-suppression")
    const rows = [
      {
        id: "tx-hashed",
        amount: 188640,
        currency: "USD",
        provider_transaction_id: "Transaction:in-wire",
        tx_hash: "grid-reported-hash",
        metadata: {
          flow: "bank_onramp",
          payout_provider: "grid",
          grid_va_inbound: true,
          wallet_balance_credit_key: "grid_va_inbound:Transaction:in-wire",
          wallet_ledger_currency: "USD",
          settled_stablecoin_amount: 188640,
          grid_on_chain_tx_hash: "grid-reported-hash",
        },
      },
    ]
    const from = vi.fn(() => {
      const api: Record<string, unknown> = {}
      const chain = () => api
      api.select = vi.fn(chain)
      api.eq = vi.fn(chain)
      api.is = vi.fn(chain)
      api.filter = vi.fn(chain)
      api.gte = vi.fn(chain)
      api.order = vi.fn(chain)
      api.limit = vi.fn(async () => ({ data: rows }))
      return api
    })
    const found = await findPendingGridVaBankDepositForInboundAmount(
      { from } as unknown as SupabaseClient,
      {
        userId: "user-1",
        businessId: "biz-1",
        amount: 188640,
        currency: "USD",
        txHash: "turnkey-wallet-hash",
      },
    )
    expect(found).toEqual({
      transactionId: "tx-hashed",
      gridTransactionId: "Transaction:in-wire",
    })
  })

  it("does not amount-match Grid VA dust inbound", async () => {
    const { findPendingGridVaBankDepositForInboundAmount } = await import("./grid-bank-deposit-chain-suppression")
    const from = vi.fn()
    const found = await findPendingGridVaBankDepositForInboundAmount(
      { from } as unknown as SupabaseClient,
      { userId: "user-1", businessId: "biz-1", amount: 0.001, currency: "USD" },
    )
    expect(found).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
})

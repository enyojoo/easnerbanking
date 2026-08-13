import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/notifications/bank-deposit-settled-notify", () => ({
  notifyGridBankDepositPayInSettledPush: vi.fn(),
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

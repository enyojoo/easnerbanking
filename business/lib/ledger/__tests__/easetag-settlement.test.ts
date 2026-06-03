import { describe, expect, it, vi, beforeEach } from "vitest"
import { findEasetagSettlementForChainSuppression } from "@/lib/ledger/easetag-settlement"

function makeAdmin(handlers: {
  settlements?: Record<string, unknown>[]
  debitByTxHash?: Record<string, unknown> | null
  debitByMetaHash?: Record<string, unknown>[]
}) {
  const settlementRows = handlers.settlements ?? []
  const debitByTxHash = handlers.debitByTxHash ?? null
  const debitByMetaHash = handlers.debitByMetaHash ?? []

  return {
    from: vi.fn((table: string) => {
      if (table === "easetag_settlements") {
        const api = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockImplementation(async function (this: { _eq: Record<string, string> }) {
            const eq = (this as { _eq?: Record<string, string> })._eq ?? {}
            if (eq.transfer_group_id) {
              const row = settlementRows.find((r) => r.transfer_group_id === eq.transfer_group_id)
              return { data: row ?? null, error: null }
            }
            if (eq.turnkey_send_status_id) {
              const row = settlementRows.find((r) => r.turnkey_send_status_id === eq.turnkey_send_status_id)
              return { data: row ?? null, error: null }
            }
            if (eq.tx_hash) {
              const row = settlementRows.find((r) => r.tx_hash === eq.tx_hash)
              return { data: row ?? null, error: null }
            }
            return { data: null, error: null }
          }),
          _eq: {} as Record<string, string>,
        }
        const chain = ["eq", "in", "is", "order", "limit"] as const
        for (const m of chain) {
          const orig = api[m]
          if (m === "eq") {
            api.eq = vi.fn((col: string, val: string) => {
              api._eq[col] = val
              return api
            }) as typeof api.eq
          } else if (m === "limit") {
            api.limit = vi.fn(async () => {
              const filtered = settlementRows.filter((r) => {
                if (api._eq.payee_user_id && r.payee_user_id !== api._eq.payee_user_id) return false
                if (api._eq.currency && r.currency !== api._eq.currency) return false
                if ("payee_business_id" in api._eq && r.payee_business_id !== api._eq.payee_business_id) return false
                if (api._eq.status && Array.isArray(api._eq.status)) {
                  return (api._eq.status as unknown as string[]).includes(String(r.status))
                }
                return true
              })
              return { data: filtered, error: null }
            }) as typeof api.limit
          } else {
            api[m] = vi.fn(() => api) as (typeof api)[typeof m]
          }
          void orig
        }
        return api
      }
      if (table === "transactions") {
        let metaHashQuery = false
        const txApi = {
          select: vi.fn(() => txApi),
          eq: vi.fn(() => txApi),
          like: vi.fn(() => txApi),
          filter: vi.fn(() => {
            metaHashQuery = true
            return txApi
          }),
          limit: vi.fn(() => {
            if (metaHashQuery) {
              return Promise.resolve({ data: debitByMetaHash, error: null })
            }
            return txApi
          }),
          maybeSingle: vi.fn(async () => ({ data: debitByTxHash, error: null })),
        }
        return txApi
      }
      throw new Error(`unexpected table ${table}`)
    }),
  }
}

describe("findEasetagSettlementForChainSuppression", () => {
  beforeEach(() => vi.clearAllMocks())

  it("matches pending settlement by payee and amount", async () => {
    const admin = makeAdmin({
      settlements: [
        {
          transfer_group_id: "tg-1",
          idempotency_key: "k1",
          status: "pending",
          sender_user_id: "s1",
          sender_business_id: null,
          payee_user_id: "p1",
          payee_business_id: null,
          amount: 7,
          currency: "USD",
          asset: "USDC",
          turnkey_send_status_id: null,
          tx_hash: null,
          error: null,
          debit_provider_transaction_id: null,
          credit_provider_transaction_id: null,
        },
      ],
    })

    const row = await findEasetagSettlementForChainSuppression(admin as never, {
      payeeUserId: "p1",
      payeeBusinessId: null,
      amount: 7,
      currency: "USD",
    })
    expect(row?.transfer_group_id).toBe("tg-1")
  })

  it("matches settlement via easetag_p2p debit tx_hash before settlement row has tx_hash", async () => {
    const admin = makeAdmin({
      settlements: [
        {
          transfer_group_id: "tg-2",
          idempotency_key: "k2",
          status: "pending",
          sender_user_id: "s1",
          sender_business_id: null,
          payee_user_id: "p1",
          payee_business_id: null,
          amount: 7,
          currency: "USD",
          asset: "USDC",
          turnkey_send_status_id: null,
          tx_hash: null,
          error: null,
          debit_provider_transaction_id: null,
          credit_provider_transaction_id: null,
        },
      ],
      debitByTxHash: {
        metadata: { transfer_group_id: "tg-2", source: "easetag_p2p" },
      },
    })

    const row = await findEasetagSettlementForChainSuppression(admin as never, {
      txHash: "sig-abc",
    })
    expect(row?.transfer_group_id).toBe("tg-2")
  })
})

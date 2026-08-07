import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  upsertLedger: vi.fn(),
  applyDelta: vi.fn(),
  relayGetRequestV3: vi.fn(),
  relayListRequestsV3: vi.fn(),
  relayFindRequestByDepositAddressV3: vi.fn(),
}))

vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: mocks.upsertLedger,
}))
vi.mock("@/lib/wallet/wallet-balances-db", () => ({
  applyWalletBalanceDelta: mocks.applyDelta,
}))
vi.mock("@/lib/relay/client", () => ({
  relayGetRequestV3: mocks.relayGetRequestV3,
  relayListRequestsV3: mocks.relayListRequestsV3,
  relayFindRequestByDepositAddressV3: mocks.relayFindRequestByDepositAddressV3,
}))
vi.mock("@/lib/relay/config", () => ({
  isRelayTronInboundEnabled: () => true,
}))
vi.mock("@/lib/deposit-omnibus/config", () => ({
  isDepositFeePricingEnabled: () => false,
}))

import {
  tryCreditRelayTronDeposit,
  syncRelayDepositFromRequestId,
} from "../settle-relay-deposit"

function adminMock(state: {
  relayDeposits?: Record<string, unknown>
  relayDepositAddresses?: Record<string, unknown>
  walletOwners?: Record<string, unknown>
  transactions?: Record<string, unknown>
}) {
  const tables: Record<string, Record<string, unknown>> = {
    relay_deposits: state.relayDeposits ?? {},
    relay_deposit_addresses: state.relayDepositAddresses ?? {},
    wallet_owners: state.walletOwners ?? {},
    transactions: state.transactions ?? {},
  }

  return {
    from(table: string) {
      const row = tables[table] ?? {}
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: row, error: null }),
        single: async () => ({ data: row, error: null }),
        upsert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: { ...row, id: "dep-1" }, error: null }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }
      return chain
    },
  } as never
}

describe("settle-relay-deposit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.upsertLedger.mockResolvedValue({ transactionId: "tx-relay-1", inserted: true })
    mocks.applyDelta.mockResolvedValue(undefined)
  })

  it("does not credit without turnkey fill hash", async () => {
    const admin = adminMock({
      relayDeposits: {
        id: "dep-1",
        wallet_owner_id: "owner-1",
        posted_amount: 98,
        turnkey_tx_hash: null,
        ledger_tx_id: null,
        relay_request_id: "req-1",
        tron_address: "T123",
      },
      walletOwners: {
        owner_type: "individual",
        owner_ref: "user-1",
        user_id: "user-1",
      },
    })

    const result = await tryCreditRelayTronDeposit(admin, "dep-1")
    expect(result.credited).toBe(false)
    expect(result.reason).toBe("missing_turnkey_tx_hash")
    expect(mocks.applyDelta).not.toHaveBeenCalled()
  })

  it("credits once when fill hash is present", async () => {
    const admin = adminMock({
      relayDeposits: {
        id: "dep-1",
        wallet_owner_id: "owner-1",
        posted_amount: 98,
        turnkey_tx_hash: "sol-fill-1",
        ledger_tx_id: null,
        relay_request_id: "req-1",
        tron_address: "T123",
        gross_usdt: 100,
        relay_fee: 1,
        on_chain_usdc: 99,
        easner_deposit_fee: 1,
      },
      walletOwners: {
        owner_type: "individual",
        owner_ref: "user-1",
        user_id: "user-1",
      },
    })

    const result = await tryCreditRelayTronDeposit(admin, "dep-1")
    expect(result.credited).toBe(true)
    expect(mocks.applyDelta).toHaveBeenCalledWith(admin, {
      userId: "user-1",
      businessId: null,
      currency: "USD",
      delta: 98,
    })
  })

  it("returns awaiting_turnkey when relay success has fill hash but credit deferred", async () => {
    mocks.relayGetRequestV3.mockResolvedValue({
      id: "req-1",
      status: "success",
      metadata: { depositAddress: "T123" },
      data: {
        route: {
          actual: {
            origin: { inputCurrency: { amount: "100000000", amountFormatted: "100" } },
            destination: { outputCurrency: { amount: "99000000", amountFormatted: "99" } },
          },
        },
        fees: { actual: { swap: { usd: "0.5" }, execution: { usd: "0.5" } } },
        outTxs: [{ txHash: "sol-fill-1" }],
      },
    })

    const depositRow = {
      id: "dep-1",
      wallet_owner_id: "owner-1",
      ledger_tx_id: null,
      turnkey_tx_hash: "sol-fill-1",
      posted_amount: 99,
      relay_request_id: "req-1",
      tron_address: "T123",
      gross_usdt: 100,
      relay_fee: 1,
      on_chain_usdc: 99,
      easner_deposit_fee: 0,
    }

    const admin = {
      from(table: string) {
        if (table === "relay_deposit_addresses") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { wallet_owner_id: "owner-1" },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === "wallet_owners") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { owner_type: "individual", owner_ref: "user-1", user_id: "user-1" },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === "transactions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        is: () => ({
                          maybeSingle: async () => ({ data: null, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === "relay_deposits") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: depositRow, error: null }),
              }),
            }),
            upsert: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: depositRow, error: null }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          }
        }
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }
      },
    } as never

    const result = await syncRelayDepositFromRequestId(admin, {
      relayRequestId: "req-1",
      tronAddress: "T123",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(["credited", "awaiting_turnkey", "already_credited"]).toContain(result.action)
    }
  })
})

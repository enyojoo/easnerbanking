import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const applyWalletBalanceDelta = vi.fn(async () => undefined)

vi.mock("@/lib/wallet/wallet-balances-db", () => ({
  applyWalletBalanceDelta: (...args: unknown[]) => applyWalletBalanceDelta(...args),
}))

import {
  applyGlobalPayoutWalletDebitForEasnerPayoutId,
  reverseGlobalPayoutWalletDebitForEasnerPayoutId,
} from "../global-payout-ledger"

function createPayoutAdmin(initialMeta: Record<string, unknown> = {}) {
  const easnerPayoutId = "payout-test-1"
  let metadata: Record<string, unknown> = {
    easner_payout_id: easnerPayoutId,
    payout_type: "global_fiat",
    total_debited: 42.5,
    ...initialMeta,
  }

  const pendingRow = { id: "tx-row-1", metadata: { easner_payout_id: easnerPayoutId } }
  const fullRow = {
    id: "tx-row-1",
    user_id: "user-1",
    business_id: null,
    amount: 42.5,
    currency: "USD",
    get metadata() {
      return metadata
    },
  }

  const admin = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, _val: unknown) {
              const secondEq = {
                eq(_col2: string, _val2: unknown) {
                  return {
                    maybeSingle: async () => {
                      if (col === "provider") {
                        return { data: pendingRow, error: null }
                      }
                      return { data: null, error: null }
                    },
                  }
                },
                contains: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
                maybeSingle: async () => {
                  if (col === "id") {
                    return { data: fullRow, error: null }
                  }
                  if (col === "currency") {
                    return { data: { available_balance: 100, version: 1 }, error: null }
                  }
                  return { data: null, error: null }
                },
              }
              return secondEq
            },
          }
        },
        update(payload: Record<string, unknown>) {
          return {
            eq: async () => {
              if (payload.metadata && typeof payload.metadata === "object") {
                metadata = {
                  ...metadata,
                  ...(payload.metadata as Record<string, unknown>),
                }
              }
              return { error: null }
            },
          }
        },
      }
    },
  }

  return {
    admin: admin as unknown as SupabaseClient,
    getMetadata: () => metadata,
    easnerPayoutId,
  }
}

describe("applyGlobalPayoutWalletDebitForEasnerPayoutId", () => {
  beforeEach(() => {
    applyWalletBalanceDelta.mockClear()
  })

  it("reserve debit sets balance_delta_applied and wallet_debit_reserved_at without turnkey_settled", async () => {
    const { admin, getMetadata, easnerPayoutId } = createPayoutAdmin()

    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })

    expect(applyWalletBalanceDelta).toHaveBeenCalledTimes(1)
    expect(applyWalletBalanceDelta).toHaveBeenCalledWith(admin, {
      businessId: null,
      userId: "user-1",
      currency: "USD",
      delta: -42.5,
    })
    const meta = getMetadata()
    expect(meta.balance_delta_applied).toBe(true)
    expect(meta.wallet_debit_reserved_at).toEqual(expect.any(String))
    expect(meta.turnkey_settled).toBeUndefined()
  })

  it("second reserve call does not debit again", async () => {
    const { admin, easnerPayoutId } = createPayoutAdmin()

    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })
    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })

    expect(applyWalletBalanceDelta).toHaveBeenCalledTimes(1)
  })

  it("markTurnkeySettled patches turnkey_settled when already reserved", async () => {
    const { admin, getMetadata, easnerPayoutId } = createPayoutAdmin()

    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })
    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
      easnerPayoutId,
      markTurnkeySettled: true,
    })

    expect(applyWalletBalanceDelta).toHaveBeenCalledTimes(1)
    expect(getMetadata().turnkey_settled).toBe(true)
  })

  it("markTurnkeySettled on first debit sets turnkey_settled", async () => {
    const { admin, getMetadata, easnerPayoutId } = createPayoutAdmin()

    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
      easnerPayoutId,
      markTurnkeySettled: true,
    })

    expect(getMetadata().turnkey_settled).toBe(true)
    expect(getMetadata().balance_delta_applied).toBe(true)
  })
})

describe("reverseGlobalPayoutWalletDebitForEasnerPayoutId", () => {
  beforeEach(() => {
    applyWalletBalanceDelta.mockClear()
  })

  it("credits back after reserve and sets balance_delta_reversed", async () => {
    const { admin, getMetadata, easnerPayoutId } = createPayoutAdmin()

    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })
    applyWalletBalanceDelta.mockClear()

    const reversed = await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
      easnerPayoutId,
    })

    expect(reversed).toBe(true)
    expect(applyWalletBalanceDelta).toHaveBeenCalledTimes(1)
    expect(applyWalletBalanceDelta).toHaveBeenCalledWith(admin, {
      businessId: null,
      userId: "user-1",
      currency: "USD",
      delta: 42.5,
    })
    expect(getMetadata().balance_delta_reversed).toBe(true)
  })
})

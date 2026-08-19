import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("server-only", () => ({}))

const gridFetch = vi.hoisted(() => vi.fn())
const loadInternal = vi.hoisted(() => vi.fn())
const registerTurnkey = vi.hoisted(() => vi.fn())
const persistRefundHash = vi.hoisted(() => vi.fn())

vi.mock("./http", () => ({
  gridFetch: (...args: unknown[]) => gridFetch(...args),
  GridHttpError: class GridHttpError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock("./quote-request", async () => {
  const actual = await vi.importActual<typeof import("./quote-request")>("./quote-request")
  return {
    ...actual,
    loadGridCustomerInternalAccount: (...args: unknown[]) => loadInternal(...args),
  }
})

vi.mock("./quote-funding", () => ({
  retrieveGridQuote: vi.fn(),
}))

vi.mock("./turnkey-external-account", () => ({
  registerTurnkeyUsdcExternalAccount: (...args: unknown[]) => registerTurnkey(...args),
}))

vi.mock("@/lib/noah/global-payout-ledger", () => ({
  persistGlobalPayoutRefundTxHashOnOutRow: (...args: unknown[]) => persistRefundHash(...args),
}))

import { startGridPayoutRefundTurnkeySweep } from "./payout-refund-sweep"

function adminWithInsert() {
  let stored: Record<string, unknown> | null = null
  const from = vi.fn((_table: string) => {
    const api: Record<string, unknown> = {}
    const chain = () => api
    api.select = vi.fn(chain)
    api.eq = vi.fn(chain)
    api.filter = vi.fn(chain)
    api.maybeSingle = vi.fn(async () => ({ data: stored }))
    api.insert = vi.fn((row: Record<string, unknown>) => {
      stored = {
        id: "sweep-1",
        user_id: "user-1",
        business_id: "biz-1",
        transaction_id: "tx-out-1",
        status: "pending",
        grid_quote_id: null,
        grid_transaction_id: null,
        quoted_pay_in: row.quoted_pay_in,
        grid_customer_id: "Customer:abc",
        metadata: {
          easner_payout_id: "payout-1",
          source_internal_account_id: "InternalAccount:usdc",
          refund_usdc_amount: row.quoted_pay_in,
        },
      }
      api.select = vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { id: "sweep-1" }, error: null })),
      }))
      return api
    })
    api.update = vi.fn(chain)
    return api
  })
  return { from } as unknown as SupabaseClient
}

describe("startGridPayoutRefundTurnkeySweep", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadInternal.mockResolvedValue({
      id: "InternalAccount:usdc",
      balanceMajor: 1.5,
    })
    registerTurnkey.mockResolvedValue("ExternalAccount:turnkey")
    gridFetch.mockResolvedValue({
      id: "Quote:refund",
      status: "PROCESSING",
      transactionId: "Transaction:refund",
    })
  })

  it("quotes the stranded USDC back to the Turnkey external account", async () => {
    const result = await startGridPayoutRefundTurnkeySweep(adminWithInsert(), {
      userId: "user-1",
      businessId: "biz-1",
      customerId: "Customer:abc",
      easnerPayoutId: "payout-1",
      payoutLedgerTransactionId: "tx-out-1",
      failedGridTransactionId: "Transaction:failed",
      requestedAmountUsdc: 1.501175,
    })

    expect(result.ok).toBe(true)
    expect(result.amount).toBe(1.5)
    expect(gridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/quotes",
        json: expect.objectContaining({
          source: { sourceType: "ACCOUNT", accountId: "InternalAccount:usdc" },
          destination: { destinationType: "ACCOUNT", accountId: "ExternalAccount:turnkey" },
          lockedCurrencyAmount: 1_500_000,
          immediatelyExecute: true,
          purposeOfPayment: "SELF",
        }),
      }),
    )
  })
})

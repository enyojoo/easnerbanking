import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}))

vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: vi.fn(),
}))

vi.mock("@/lib/processing-fee/capture-pending-processing-fee", () => ({
  captureYcBalancePayoutProcessingFeeIfPending: vi.fn(),
}))

vi.mock("@/lib/processing-fee/fee-wallet-sweep", () => ({
  isEasnerRevenueAlreadySwept: vi.fn(() => false),
}))

import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { captureYcBalancePayoutProcessingFeeIfPending } from "@/lib/processing-fee/capture-pending-processing-fee"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { handleYcBalancePayoutSendComplete } from "./payout-execute"

describe("handleYcBalancePayoutSendComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(upsertLedgerTransaction).mockResolvedValue({
      transactionId: "tx-1",
      inserted: false,
      updated: true,
      previousStatus: "processing",
      nextStatus: "settled",
      becameSettled: true,
      becameFailed: false,
    })
    vi.mocked(captureYcBalancePayoutProcessingFeeIfPending).mockResolvedValue({ captured: true })
  })

  it("settles then captures fee only after turnkey principal leg", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      update: vi.fn().mockReturnThis(),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => chain),
    } as never)

    chain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: "tx-1",
          user_id: "user-1",
          business_id: null,
          status: "processing",
          metadata: {
            total_debited: 4.61368,
            crypto_authorized_amount: "4.520121",
            margin_amount: 0.056124,
            processing_fee: 0.037435,
            easner_payout_id: "payout-1",
            form_session_id: "yc_quote_abc",
            turnkey_send_id: "tk-principal-1",
            processing_fee_pending: true,
            yc_mode: "balance_payout",
          },
          amount: 4.61368,
          provider: "yellowcard",
          provider_transaction_id: "yc-1",
        },
      })
      .mockResolvedValueOnce({
        data: {
          metadata: {
            fee_wallet_sweep: 0.093559,
            fee_wallet_sweep_tx_hash: "sweep-hash",
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "tr-1",
          metadata: {},
        },
      })
    chain.update.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)

    await handleYcBalancePayoutSendComplete({
      transactionId: "tx-1",
      userId: "user-1",
      businessId: null,
    })

    expect(upsertLedgerTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "settled" }),
    )
    expect(captureYcBalancePayoutProcessingFeeIfPending).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ transactionId: "tx-1" }),
    )
  })

  it("skips when turnkey principal leg never ran", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => chain),
    } as never)

    chain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "tx-1",
        user_id: "user-1",
        business_id: null,
        status: "processing",
        metadata: {
          processing_fee_pending: true,
          yc_mode: "balance_payout",
        },
        amount: 1,
        provider: "yellowcard",
        provider_transaction_id: "yc-1",
      },
    })

    await handleYcBalancePayoutSendComplete({
      transactionId: "tx-1",
      userId: "user-1",
      businessId: null,
    })

    expect(captureYcBalancePayoutProcessingFeeIfPending).not.toHaveBeenCalled()
    expect(upsertLedgerTransaction).not.toHaveBeenCalled()
  })
})

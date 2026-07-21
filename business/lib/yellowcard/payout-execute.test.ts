import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}))

vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: vi.fn(),
}))

vi.mock("@/lib/processing-fee/capture-pending-processing-fee", () => ({
  resolveNoahAccountContextFromLedgerScope: vi.fn(),
}))

vi.mock("@/lib/processing-fee/fee-wallet-sweep", () => ({
  readPriorSweepFromMetadata: vi.fn(() => ({ captured: false })),
  sweepEasnerRevenueFromUserTurnkeyWallet: vi.fn(),
  buildEasnerRevenueSweepMetadataPatch: vi.fn(() => ({})),
  FEE_SWEEP_MIN: 0.01,
}))

import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import { sweepEasnerRevenueFromUserTurnkeyWallet } from "@/lib/processing-fee/fee-wallet-sweep"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { handleYcBalancePayoutSendComplete } from "./payout-execute"

describe("handleYcBalancePayoutSendComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(upsertLedgerTransaction).mockResolvedValue({ transactionId: "tx-1" })
    vi.mocked(resolveNoahAccountContextFromLedgerScope).mockResolvedValue({
      scope: "individual",
      customerType: "Individual",
      subjectBusinessId: null,
      subjectUserId: "user-1",
      noahCustomerId: "cust-1",
    })
    vi.mocked(sweepEasnerRevenueFromUserTurnkeyWallet).mockResolvedValue({
      feeWalletSweepTxHash: "sweep-hash",
      captured: true,
      turnkeySendId: "fee-send-1",
    })
  })

  it("sweeps Easner revenue from user Turnkey wallet on complete", async () => {
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
          metadata: {
            total_debited: 4.61368,
            crypto_authorized_amount: "4.520121",
            margin_amount: 0.056124,
            processing_fee: 0.037435,
            easner_payout_id: "payout-1",
            form_session_id: "yc_quote_abc",
          },
          amount: 4.61368,
          provider: "yellowcard",
          provider_transaction_id: "yc-1",
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "tx-1",
          metadata: {
            total_debited: 4.61368,
            crypto_authorized_amount: "4.520121",
            margin_amount: 0.056124,
            processing_fee: 0.037435,
            easner_payout_id: "payout-1",
            form_session_id: "yc_quote_abc",
          },
          amount: 4.61368,
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

    expect(sweepEasnerRevenueFromUserTurnkeyWallet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amount: expect.closeTo(0.093559, 6),
        globalPayout: {
          easnerPayoutId: "payout-1",
          formSessionId: "yc_quote_abc",
        },
      }),
    )
  })
})

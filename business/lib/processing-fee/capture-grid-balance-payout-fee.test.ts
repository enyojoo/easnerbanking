import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/processing-fee/fee-wallet-sweep", () => ({
  sweepEasnerRevenueFromUserTurnkeyWallet: vi.fn(),
  pollTurnkeySendById: vi.fn().mockResolvedValue({ status: "settled", txHash: "principal-hash" }),
}))

vi.mock("@/lib/processing-fee/fee-wallet-inbound-deposit", () => ({
  ensureFeeWalletRevenueDeposit: vi.fn().mockResolvedValue({ inserted: true, existing: false }),
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId: vi.fn(),
}))

import { captureGridBalancePayoutProcessingFeeIfPending } from "./capture-pending-processing-fee"
import { sweepEasnerRevenueFromUserTurnkeyWallet } from "@/lib/processing-fee/fee-wallet-sweep"

describe("captureGridBalancePayoutProcessingFeeIfPending", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sweeps Grid surplus to the fee wallet even when processing_fee_pending was never set", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "a7144467-81f7-4ec8-a72c-34ff68b4f670",
            status: "settled",
            amount: 1.523926,
            metadata: {
              payout_provider: "grid",
              grid_mode: "balance_payout",
              turnkey_send_id: "tk-1",
              easner_payout_id: "payout-1",
              form_session_id: "grid_quote_1",
              crypto_authorized_amount: "1.502259",
              total_debited: 1.523926,
              processing_fee: 0.014445,
              margin_amount: 0.007222,
            },
          },
        }),
        update,
      })),
    }

    vi.mocked(sweepEasnerRevenueFromUserTurnkeyWallet).mockResolvedValue({
      feeWalletSweepTxHash: "fee-hash",
      captured: true,
      turnkeySendId: "fee-send-1",
    })

    const result = await captureGridBalancePayoutProcessingFeeIfPending(admin as never, {
      transactionId: "a7144467-81f7-4ec8-a72c-34ff68b4f670",
      userId: "user-1",
      businessId: "biz-1",
    })

    expect(result.captured).toBe(true)
    const sweepArg = vi.mocked(sweepEasnerRevenueFromUserTurnkeyWallet).mock.calls[0]?.[1]
    expect(sweepArg?.logTag).toBe("grid-balance-payout")
    expect(sweepArg?.amount).toBeCloseTo(0.021667, 6)
  })
})

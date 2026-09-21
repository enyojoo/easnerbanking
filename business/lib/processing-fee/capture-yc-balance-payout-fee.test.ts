import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/processing-fee/fee-wallet-sweep", () => ({
  sweepEasnerRevenueFromUserTurnkeyWallet: vi.fn(),
  pollTurnkeySendById: vi.fn(),
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId: vi.fn(),
}))

import { captureYcBalancePayoutProcessingFeeIfPending } from "./capture-pending-processing-fee"
import {
  pollTurnkeySendById,
  sweepEasnerRevenueFromUserTurnkeyWallet,
} from "@/lib/processing-fee/fee-wallet-sweep"

const ETID_META = {
  source: "api_yellowcard_balance_payout",
  yc_mode: "balance_payout",
  payout_provider: "yellowcard",
  payout_type: "global_fiat",
  easner_payout_id: "5b3d4054-5f9e-47b5-a904-c3595c57ee1a",
  turnkey_send_id: "sha256:principal",
  turnkey_send_status: "pending",
  yc_crypto_deposit_status: "pending",
  processing_fee: 3.671217,
  margin_amount: 0,
  total_debited: 374.496217,
  crypto_authorized_amount: "370.825",
  processing_fee_pending: false,
  processing_fee_captured_at: "2026-09-21T15:08:06.205Z",
  processing_fee_turnkey_send_id: "sha256:fee",
  margin_turnkey_send_id: "sha256:fee",
  form_session_id: "yc_quote_1",
}

function adminWithTx(metadata: Record<string, unknown>) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  return {
    update,
    admin: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "tx-etid",
            status: "settled",
            amount: 374.496217,
            metadata,
          },
        }),
        update,
      })),
    },
  }
}

describe("captureYcBalancePayoutProcessingFeeIfPending", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("retries a false-captured fee send that never got a signature", async () => {
    const { admin } = adminWithTx(ETID_META)
    vi.mocked(pollTurnkeySendById).mockImplementation(async (_client, input) => {
      if (input.sendId === "sha256:principal") {
        return { status: "settled", txHash: "yc-deposit-sig" }
      }
      return { status: "failed", txHash: null }
    })
    vi.mocked(sweepEasnerRevenueFromUserTurnkeyWallet).mockResolvedValue({
      feeWalletSweepTxHash: "fee-sig",
      captured: true,
      turnkeySendId: "sha256:fee-retry",
    })

    const result = await captureYcBalancePayoutProcessingFeeIfPending(admin as never, {
      transactionId: "tx-etid",
      userId: "user-1",
      businessId: null,
    })

    expect(result.captured).toBe(true)
    expect(sweepEasnerRevenueFromUserTurnkeyWallet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ logTag: "yc-balance-payout", amount: expect.closeTo(3.671217, 5) }),
    )
  })

  it("does not submit a second fee send while the first is still pending and fresh", async () => {
    const { admin } = adminWithTx({
      ...ETID_META,
      processing_fee_captured_at: new Date().toISOString(),
      processing_fee_submitted_at: new Date().toISOString(),
    })
    vi.mocked(pollTurnkeySendById).mockResolvedValue({ status: "pending", txHash: null })

    const result = await captureYcBalancePayoutProcessingFeeIfPending(admin as never, {
      transactionId: "tx-etid",
      userId: "user-1",
      businessId: null,
    })

    expect(result.captured).toBe(false)
    expect(sweepEasnerRevenueFromUserTurnkeyWallet).not.toHaveBeenCalled()
  })
})

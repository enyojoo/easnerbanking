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

vi.mock("@/lib/noah/global-payout-ledger", () => ({
  findGlobalPayoutNoahRowByEasnerPayoutId: vi.fn(),
  reverseGlobalPayoutWalletDebitForEasnerPayoutId: vi.fn(),
  linkPendingGlobalPayoutProviderTransactionId: vi.fn(),
  pendingGlobalPayoutProviderTransactionId: (id: string) => `global_payout_pending:${id}`,
}))

vi.mock("@/lib/turnkey/send-from-omnibus", () => ({
  sendStablecoinFromDepositOmnibus: vi.fn(),
}))

vi.mock("@/lib/wallet/resolve-active-usdc-solana-address", () => ({
  resolveActiveUsdcSolanaAddress: vi.fn(),
}))

import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import {
  findGlobalPayoutNoahRowByEasnerPayoutId,
  reverseGlobalPayoutWalletDebitForEasnerPayoutId,
} from "@/lib/noah/global-payout-ledger"
import { captureYcBalancePayoutProcessingFeeIfPending } from "@/lib/processing-fee/capture-pending-processing-fee"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { sendStablecoinFromDepositOmnibus } from "@/lib/turnkey/send-from-omnibus"
import { resolveActiveUsdcSolanaAddress } from "@/lib/wallet/resolve-active-usdc-solana-address"
import {
  handleYcBalancePayoutSendComplete,
  handleYcBalancePayoutSendFailed,
  recreditYcExactLocalPayoutOnChain,
} from "./payout-execute"

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

describe("recreditYcExactLocalPayoutOnChain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("skips non-exact settlement modes", async () => {
    vi.mocked(findGlobalPayoutNoahRowByEasnerPayoutId).mockResolvedValue({
      id: "tx-1",
      user_id: "user-1",
      business_id: null,
      amount: 1.5,
      currency: "USD",
      metadata: { yc_settlement_mode: "direct_crypto", crypto_authorized_amount: 1.48 },
    })
    const admin = { from: vi.fn() } as never
    const result = await recreditYcExactLocalPayoutOnChain(admin, { easnerPayoutId: "payout-1" })
    expect(result).toEqual({ ok: true, skipped: true, txHash: null, amount: null })
    expect(sendStablecoinFromDepositOmnibus).not.toHaveBeenCalled()
  })

  it("sends crypto_authorized_amount from omnibus to the user Turnkey address", async () => {
    vi.mocked(findGlobalPayoutNoahRowByEasnerPayoutId).mockResolvedValue({
      id: "tx-1",
      user_id: "user-1",
      business_id: null,
      amount: 1.55,
      currency: "USD",
      metadata: {
        yc_settlement_mode: "balance_exact",
        crypto_authorized_amount: 1.529498,
      },
    })
    vi.mocked(resolveActiveUsdcSolanaAddress).mockResolvedValue("user-turnkey")
    vi.mocked(sendStablecoinFromDepositOmnibus).mockResolvedValue({
      dryRun: false,
      providerTransactionId: "omnibus-send-1",
      sendTransactionStatusId: null,
      status: "settled",
      txHash: "refund-hash",
      errorMessage: null,
    })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const admin = {
      from: vi.fn(() => ({ update })),
    } as never

    const result = await recreditYcExactLocalPayoutOnChain(admin, { easnerPayoutId: "payout-1" })

    expect(result).toEqual({ ok: true, txHash: "refund-hash", amount: 1.529498 })
    expect(sendStablecoinFromDepositOmnibus).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAddress: "user-turnkey",
        amount: 1.529498,
        asset: "USDC",
      }),
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          yc_refund_expected: true,
          yc_refund_tx_hash: "refund-hash",
          yc_omnibus_refund_completed: true,
        }),
      }),
    )
  })
})

describe("handleYcBalancePayoutSendFailed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createSupabaseAdmin).mockReturnValue({} as never)
    vi.mocked(reverseGlobalPayoutWalletDebitForEasnerPayoutId).mockResolvedValue(true)
  })

  it("recredits on-chain for balance_exact then reverses the ledger", async () => {
    vi.mocked(findGlobalPayoutNoahRowByEasnerPayoutId).mockResolvedValue({
      id: "tx-1",
      user_id: "user-1",
      business_id: null,
      amount: 1.55,
      currency: "USD",
      metadata: {
        yc_settlement_mode: "balance_exact",
        crypto_authorized_amount: 1.53,
      },
    })
    vi.mocked(resolveActiveUsdcSolanaAddress).mockResolvedValue("user-turnkey")
    vi.mocked(sendStablecoinFromDepositOmnibus).mockResolvedValue({
      dryRun: false,
      providerTransactionId: "omnibus-send-1",
      sendTransactionStatusId: null,
      status: "settled",
      txHash: "refund-hash",
      errorMessage: null,
    })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({ update })),
    } as never)

    await handleYcBalancePayoutSendFailed({ easnerPayoutId: "payout-1" })

    expect(sendStablecoinFromDepositOmnibus).toHaveBeenCalled()
    expect(reverseGlobalPayoutWalletDebitForEasnerPayoutId).toHaveBeenCalledWith(
      expect.anything(),
      { easnerPayoutId: "payout-1" },
    )
  })

  it("does not reverse the ledger when omnibus recredit fails", async () => {
    vi.mocked(findGlobalPayoutNoahRowByEasnerPayoutId).mockResolvedValue({
      id: "tx-1",
      user_id: "user-1",
      business_id: null,
      amount: 1.55,
      currency: "USD",
      metadata: {
        yc_settlement_mode: "balance_exact",
        crypto_authorized_amount: 1.53,
      },
    })
    vi.mocked(resolveActiveUsdcSolanaAddress).mockResolvedValue("user-turnkey")
    vi.mocked(sendStablecoinFromDepositOmnibus).mockResolvedValue({
      dryRun: false,
      providerTransactionId: null,
      sendTransactionStatusId: null,
      status: "failed",
      txHash: null,
      errorMessage: "insufficient_omnibus",
    })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({ update })),
    } as never)

    await handleYcBalancePayoutSendFailed({ easnerPayoutId: "payout-1" })

    expect(reverseGlobalPayoutWalletDebitForEasnerPayoutId).not.toHaveBeenCalled()
  })

  it("only reverses the ledger for direct_crypto (YC refunds on-chain)", async () => {
    vi.mocked(findGlobalPayoutNoahRowByEasnerPayoutId).mockResolvedValue({
      id: "tx-1",
      user_id: "user-1",
      business_id: null,
      amount: 1.5,
      currency: "USD",
      metadata: { yc_settlement_mode: "direct_crypto" },
    })

    await handleYcBalancePayoutSendFailed({ easnerPayoutId: "payout-1" })

    expect(sendStablecoinFromDepositOmnibus).not.toHaveBeenCalled()
    expect(reverseGlobalPayoutWalletDebitForEasnerPayoutId).toHaveBeenCalled()
  })
})

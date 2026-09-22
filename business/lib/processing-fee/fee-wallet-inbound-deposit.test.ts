import { describe, expect, it, vi } from "vitest"
import {
  ensureFeeWalletRevenueDeposit,
  feeWalletSweepAmountFromMeta,
  stampFeeWalletSweepHashOnTransaction,
} from "./fee-wallet-inbound-deposit"

vi.mock("@/lib/wallet-send/fee-address", () => ({
  resolveWalletSendFeeSolanaAddress: () => "J8Xh2H1WLd252soocN2r3R3CbgadA5Rq9LBMvXkUyDVA",
  isWalletSendFeeSolanaAddress: (address: string) =>
    address === "J8Xh2H1WLd252soocN2r3R3CbgadA5Rq9LBMvXkUyDVA",
}))

vi.mock("@/lib/turnkey/resolve-turnkey-wallet-scope", () => ({
  resolveTurnkeyWalletScopeFromEvent: vi.fn(),
}))

vi.mock("@/lib/turnkey/inbound-hash-visible-ledger", () => ({
  inboundHashHasVisibleLedgerCredit: vi.fn(),
}))

import { resolveTurnkeyWalletScopeFromEvent } from "@/lib/turnkey/resolve-turnkey-wallet-scope"
import { inboundHashHasVisibleLedgerCredit } from "@/lib/turnkey/inbound-hash-visible-ledger"

describe("ensureFeeWalletRevenueDeposit", () => {
  it("skips insert when the hash is already a visible inbound", async () => {
    vi.mocked(resolveTurnkeyWalletScopeFromEvent).mockResolvedValue({
      userId: "user-1",
      businessId: "biz-1",
      walletAddress: "J8Xh2H1WLd252soocN2r3R3CbgadA5Rq9LBMvXkUyDVA",
      tokenAccountAddress: "ata-1",
      walletAccount: { id: "wa-1" },
    } as never)
    vi.mocked(inboundHashHasVisibleLedgerCredit).mockResolvedValue(true)

    const insert = vi.fn()
    const result = await ensureFeeWalletRevenueDeposit(
      { from: vi.fn(() => ({ insert })) } as never,
      { txHash: "sig-1", amount: 4.405302 },
    )
    expect(result).toEqual({ inserted: false, existing: true })
    expect(insert).not.toHaveBeenCalled()
  })

  it("inserts a visible Stablecoin deposit on the fee wallet", async () => {
    vi.mocked(resolveTurnkeyWalletScopeFromEvent).mockResolvedValue({
      userId: "user-1",
      businessId: "biz-1",
      walletAddress: "J8Xh2H1WLd252soocN2r3R3CbgadA5Rq9LBMvXkUyDVA",
      tokenAccountAddress: "ata-1",
      walletAccount: { id: "wa-1" },
    } as never)
    vi.mocked(inboundHashHasVisibleLedgerCredit).mockResolvedValue(false)

    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((table: string) => {
      if (table === "transactions") return { insert }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      }
    })

    const result = await ensureFeeWalletRevenueDeposit({ from } as never, {
      txHash: "sig-new",
      amount: 4.405302,
      fromAddress: "CZL3uoLy1j6Hye3tnrJQ82yWG3nKwcncQfUmquvHxvfC",
      relatedEasnerTransactionId: "ETID77375575",
      orgTreasuryKind: "pay_in_fee",
    })

    expect(result).toEqual({ inserted: true, existing: false })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "in",
        status: "settled",
        hidden_from_feed: false,
        tx_hash: "sig-new",
        wallet_address: "J8Xh2H1WLd252soocN2r3R3CbgadA5Rq9LBMvXkUyDVA",
        counterparty_address: "CZL3uoLy1j6Hye3tnrJQ82yWG3nKwcncQfUmquvHxvfC",
        amount: 4.405302,
        metadata: expect.objectContaining({
          fee_wallet_revenue_sweep: true,
          org_treasury_kind: "pay_in_fee",
          related_easner_transaction_id: "ETID77375575",
          suppress_in_feed: false,
        }),
      }),
    )
  })
})

describe("feeWalletSweepAmountFromMeta", () => {
  it("prefers the stamped sweep amount over raw processing fee", () => {
    expect(
      feeWalletSweepAmountFromMeta({
        fee_wallet_sweep: 4.42,
        processing_fee: 3.67,
        margin_amount: 0.75,
      }),
    ).toBe(4.42)
  })
})

describe("stampFeeWalletSweepHashOnTransaction", () => {
  it("writes the sweep hash on the payout and inserts the dest deposit", async () => {
    vi.mocked(resolveTurnkeyWalletScopeFromEvent).mockResolvedValue({
      userId: "user-1",
      businessId: "biz-1",
      walletAddress: "J8Xh2H1WLd252soocN2r3R3CbgadA5Rq9LBMvXkUyDVA",
      tokenAccountAddress: "ata-1",
      walletAccount: { id: "wa-1" },
    } as never)
    vi.mocked(inboundHashHasVisibleLedgerCredit).mockResolvedValue(false)

    const insert = vi.fn().mockResolvedValue({ error: null })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: updateEq })
    const from = vi.fn((table: string) => {
      if (table === "transactions") return { insert, update }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      }
    })

    const result = await stampFeeWalletSweepHashOnTransaction(
      { from } as never,
      {
        transactionId: "payout-row",
        meta: {
          fee_wallet_sweep: 4.423221,
          processing_fee_turnkey_send_id: "sha256:fee",
        },
        txHash: "Hr4TnEF",
        userId: "user-1",
        businessId: null,
        relatedEasnerTransactionId: "ETID84774480",
      },
    )

    expect(result).toEqual({ booked: true })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          fee_wallet_sweep_tx_hash: "Hr4TnEF",
          processing_fee_pending: false,
        }),
      }),
    )
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "in",
        tx_hash: "Hr4TnEF",
        amount: 4.423221,
      }),
    )
  })
})

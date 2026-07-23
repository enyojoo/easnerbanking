import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: vi.fn(),
}))

vi.mock("@/lib/noah/global-payout-ledger", () => ({
  applyGlobalPayoutWalletDebitForEasnerPayoutId: vi.fn(),
  reverseGlobalPayoutWalletDebitForEasnerPayoutId: vi.fn(),
  pendingGlobalPayoutProviderTransactionId: (id: string) => `global_payout_pending:${id}`,
}))

vi.mock("@/lib/processing-fee/capture-pending-processing-fee", () => ({
  resolveNoahAccountContextFromLedgerScope: vi.fn(),
}))

vi.mock("@/lib/payout/payout-lock-flags", () => ({
  isPayoutLockOnReviewEnabled: vi.fn(() => true),
}))

vi.mock("@/lib/payout/payout-lock-session", () => ({
  getPayoutLockSession: vi.fn(),
  markPayoutLockSessionExecuted: vi.fn(async () => undefined),
}))

vi.mock("@/lib/payout/recipient-snapshot-hash", () => ({
  hashRecipientSnapshot: vi.fn(() => "hash"),
}))

vi.mock("@/lib/wallet/resolve-wallet-owner", () => ({
  getWalletOwnerId: vi.fn(async () => "wallet-owner-1"),
}))

vi.mock("@/lib/wallet/resolve-active-usdc-solana-address", () => ({
  resolveActiveUsdcSolanaAddress: vi.fn(async () => "user-wallet"),
}))

vi.mock("@/lib/yellowcard/payout-execute", () => ({
  executeYcBalancePayoutTurnkeyLeg: vi.fn(),
}))

import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyGlobalPayoutWalletDebitForEasnerPayoutId } from "@/lib/noah/global-payout-ledger"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import { getPayoutLockSession } from "@/lib/payout/payout-lock-session"
import { isPayoutLockOnReviewEnabled } from "@/lib/payout/payout-lock-flags"
import { executeYcBalancePayoutTurnkeyLeg } from "@/lib/yellowcard/payout-execute"
import { executeYcBalancePayout } from "./balance-payout-execute"

const recipient = {
  id: "rec-1",
  currency: "NGN",
  country_code: "NG",
  bank_name: "Kuda",
  full_name: "Test User",
  account_number: "123",
} as never

function mockAdmin() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  }
  return {
    from: vi.fn(() => chain),
    chain,
  }
}

describe("executeYcBalancePayout ledger upserts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(upsertLedgerTransaction).mockResolvedValue({ transactionId: "tx-canonical" })
    vi.mocked(applyGlobalPayoutWalletDebitForEasnerPayoutId).mockResolvedValue(undefined)
    vi.mocked(resolveNoahAccountContextFromLedgerScope).mockResolvedValue({
      scope: "individual",
      customerType: "Individual",
      subjectBusinessId: null,
      subjectUserId: "user-1",
      noahCustomerId: "cust-1",
    })
    vi.mocked(getPayoutLockSession).mockResolvedValue({
      id: "lock-1",
      provider: "yellowcard",
      recipient_id: "rec-1",
      recipient_snapshot_hash: "hash",
      provider_payload_json: {
        sequenceId: "yc_quote_abc",
        sendId: "yc-send-123",
        channelId: "ch-1",
        cryptoAmount: 1.45,
        walletAddress: "yc-wallet",
        lockedLocalAmount: 2000,
      },
      pricing_json: {
        totalDebited: 1.48,
        customerPrincipal: 1.45,
        marginAmount: 0.007,
        processingFee: 0.014,
        channelCost: 0.007,
        ycLegFeesUsd: 0,
        settlement: { customerRate: 1371 },
      },
    } as never)
    vi.mocked(executeYcBalancePayoutTurnkeyLeg).mockResolvedValue({
      ok: true,
      txHash: "sol-hash",
      turnkeySendId: "tk-1",
    })
  })

  it("keeps global_payout_pending provider_transaction_id for all post-turnkey upserts", async () => {
    const admin = mockAdmin()
    admin.chain.maybeSingle
      .mockResolvedValueOnce({ data: { available_balance: 100 } })
      .mockResolvedValueOnce({
        data: {
          residence_country: "NG",
          full_name: "Test",
        },
      })
      .mockResolvedValueOnce({ data: { address: "user-wallet" } })
      .mockResolvedValueOnce({ data: { metadata: { yc_send_id: "yc-send-123" } } })
    admin.chain.insert.mockResolvedValue({ error: null })

    const result = await executeYcBalancePayout({
      admin: admin as never,
      userId: "user-1",
      businessId: null,
      recipientRow: recipient,
      recipientId: "rec-1",
      fiatAmount: 2000,
      fiatCurrency: "NGN",
      countryCode: "NG",
      lockId: "lock-1",
      yc: { channelId: "ch-1" },
      pricing: {
        totalDebited: 1.48,
        customerPrincipal: 1.45,
        marginAmount: 0.007,
        processingFee: 0.014,
        channelCost: 0.007,
      },
    })

    expect(result.ok).toBe(true)
    const ptids = vi
      .mocked(upsertLedgerTransaction)
      .mock.calls.map((call) => String(call[1]?.providerTransactionId ?? ""))
    expect(ptids.length).toBeGreaterThanOrEqual(2)
    for (const ptid of ptids) {
      expect(ptid.startsWith("global_payout_pending:")).toBe(true)
      expect(ptid).not.toBe("yc-send-123")
    }
  })

  it("rejects PIN execute when lock-on-review is on but lockId is missing", async () => {
    vi.mocked(isPayoutLockOnReviewEnabled).mockReturnValue(true)
    const admin = mockAdmin()
    admin.chain.maybeSingle
      .mockResolvedValueOnce({ data: { available_balance: 100 } })
      .mockResolvedValueOnce({ data: { residence_country: "NG", full_name: "Test" } })

    const result = await executeYcBalancePayout({
      admin: admin as never,
      userId: "user-1",
      businessId: null,
      recipientRow: recipient,
      recipientId: "rec-1",
      fiatAmount: 2000,
      fiatCurrency: "NGN",
      countryCode: "NG",
      yc: { channelId: "ch-1" },
      pricing: {
        totalDebited: 1.48,
        customerPrincipal: 1.45,
        marginAmount: 0.007,
        processingFee: 0.014,
        channelCost: 0.007,
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/lock expired or invalid/i)
    }
    expect(getPayoutLockSession).not.toHaveBeenCalled()
  })
})

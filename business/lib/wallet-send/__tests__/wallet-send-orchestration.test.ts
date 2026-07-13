import { describe, expect, it, vi, beforeEach } from "vitest"

const {
  createTurnkeySend,
  executeLifiWalletSend,
  applyWalletBalanceDelta,
  upsertLedgerTransaction,
  getTurnkeyDisplayBalancesUsdEur,
  getWalletSendSession,
  markWalletSendSessionExecuted,
} = vi.hoisted(() => ({
  createTurnkeySend: vi.fn(),
  executeLifiWalletSend: vi.fn(),
  applyWalletBalanceDelta: vi.fn(),
  upsertLedgerTransaction: vi.fn(),
  getTurnkeyDisplayBalancesUsdEur: vi.fn(),
  getWalletSendSession: vi.fn(),
  markWalletSendSessionExecuted: vi.fn(),
}))

vi.mock("@/lib/turnkey/send", () => ({ createTurnkeySend }))
vi.mock("../lifi-execute", () => ({ executeLifiWalletSend }))
vi.mock("@/lib/wallet/wallet-balances-db", () => ({ applyWalletBalanceDelta }))
vi.mock("@/lib/ledger/transactions", () => ({ upsertLedgerTransaction }))
vi.mock("@/lib/wallet/turnkey-chain-balances", () => ({
  getTurnkeyDisplayBalancesUsdEur,
}))
vi.mock("../wallet-send-session", () => ({
  getWalletSendSession,
  markWalletSendSessionExecuted,
}))
vi.mock("@/lib/lifi/client", () => ({ isWalletSendEnabled: () => true }))
vi.mock("../fee-address", () => ({
  assertWalletSendFeeSolanaAddressConfigured: vi.fn(),
  resolveWalletSendFeeSolanaAddress: () => "fee-wallet-address",
}))
vi.mock("@/lib/processing-fee/capture-pending-processing-fee", () => ({
  captureWalletSendFeeLegIfPending: vi.fn().mockResolvedValue({ captured: false }),
}))

import { executeWalletSend } from "../wallet-send-orchestration"

function mockAdmin(availableBalance = 1000) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { available_balance: availableBalance },
    error: null,
  })
  const afterUserEq = { maybeSingle }
  const afterLimit = { eq: vi.fn().mockReturnValue(afterUserEq) }
  const afterCurrencyEq = { limit: vi.fn().mockReturnValue(afterLimit) }
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(afterCurrencyEq) })
  return { from: vi.fn().mockReturnValue({ select }) } as never
}

const ctx = {} as never

const baseSession = {
  form_session_id: "sess-1",
  user_id: "user-1",
  recipient_id: "rec-1",
  source_balance_currency: "USD",
  receive_asset: "USDC",
  receive_network: "Solana",
  destination_address: "dest",
  receive_amount: 100,
  customer_rate: 1,
  lifi_mid: 1,
  lifi_floor: 100,
  total_debited: 101,
  margin_amount: 1,
  execution_model: "direct_turnkey" as const,
  status: "quoted",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
}

beforeEach(() => {
  vi.clearAllMocks()
  getWalletSendSession.mockResolvedValue(baseSession)
  getTurnkeyDisplayBalancesUsdEur.mockResolvedValue({ USD: "200", EUR: "0" })
  applyWalletBalanceDelta.mockResolvedValue(undefined)
  upsertLedgerTransaction.mockResolvedValue({ transactionId: "tx-1" })
  markWalletSendSessionExecuted.mockResolvedValue(undefined)
})

describe("executeWalletSend", () => {
  it("debits balance after principal send succeeds; fee leg deferred until settled", async () => {
    createTurnkeySend.mockResolvedValueOnce({
      status: "settled",
      providerTransactionId: "tk-main",
      txHash: "hash-main",
    })

    const result = await executeWalletSend({
      admin: mockAdmin(),
      ctx,
      userId: "user-1",
      businessId: null,
      recipient: { id: "rec-1" } as never,
      formSessionId: "sess-1",
    })

    expect(result.ok).toBe(true)
    expect(createTurnkeySend).toHaveBeenCalledTimes(1)
    expect(applyWalletBalanceDelta).toHaveBeenCalledTimes(1)
    expect(upsertLedgerTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amount: 101,
        metadata: expect.objectContaining({
          processing_fee_pending: true,
          payout_review: expect.objectContaining({
            total_debited: 101,
            execution_model: "direct_turnkey",
          }),
        }),
      }),
    )
  })

  it("does not debit when principal send fails", async () => {
    createTurnkeySend.mockResolvedValueOnce({
      status: "failed",
      providerTransactionId: "tk-main-fail",
      chainFailureDetail: "broadcast_failed",
    })

    const result = await executeWalletSend({
      admin: mockAdmin(),
      ctx,
      userId: "user-1",
      businessId: null,
      recipient: { id: "rec-1" } as never,
      formSessionId: "sess-1",
    })

    expect(result.ok).toBe(false)
    expect(applyWalletBalanceDelta).not.toHaveBeenCalled()
    expect(upsertLedgerTransaction).not.toHaveBeenCalled()
  })

  it("debits after LI.FI bridge succeeds; fee leg deferred", async () => {
    getWalletSendSession.mockResolvedValue({
      ...baseSession,
      receive_asset: "USDT",
      receive_network: "Tron",
      execution_model: "lifi_bridge",
      total_debited: 104.52,
      margin_amount: 1.52,
      lifi_floor: 103,
      customer_rate: 0.985,
    })
    executeLifiWalletSend.mockResolvedValue({
      ok: true,
      providerTransactionId: "lifi-1",
      status: "pending",
      txHash: "lifi-hash",
      lifiTool: "relay",
      lifiQuoteId: "q-1",
    })

    const result = await executeWalletSend({
      admin: mockAdmin(500),
      ctx,
      userId: "user-1",
      businessId: null,
      recipient: { id: "rec-1" } as never,
      formSessionId: "sess-1",
    })

    expect(result.ok).toBe(true)
    expect(executeLifiWalletSend).toHaveBeenCalledTimes(1)
    expect(applyWalletBalanceDelta).toHaveBeenCalledTimes(1)
    expect(upsertLedgerTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "lifi",
        metadata: expect.objectContaining({
          processing_fee_pending: true,
          payout_review: expect.objectContaining({
            execution_model: "lifi_bridge",
            total_debited: 104.52,
          }),
        }),
      }),
    )
  })
})

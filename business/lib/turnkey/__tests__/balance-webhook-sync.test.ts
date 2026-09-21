import { describe, expect, it, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  applyInbound: vi.fn(),
  inboundVisible: vi.fn(),
  easetagCreditVisible: vi.fn(),
  resolveScope: vi.fn(),
  isEnabled: vi.fn(),
  isOmnibus: vi.fn(),
  handleOmnibus: vi.fn(),
  feeRefund: vi.fn(),
  ledgerExists: vi.fn(),
  visibleLedgerExists: vi.fn(),
  gridVisible: vi.fn(),
  isGridTreasury: vi.fn(),
  isManagedVault: vi.fn(),
}))

vi.mock("@/lib/turnkey/config", () => ({
  isTurnkeyBalanceWebhooksIngestEnabled: mocks.isEnabled,
}))
vi.mock("@/lib/deposit-omnibus/config", () => ({
  isDepositOmnibusAddress: mocks.isOmnibus,
}))
vi.mock("@/lib/deposit-omnibus/handle-omnibus-inbound", () => ({
  handleDepositOmnibusInbound: mocks.handleOmnibus,
}))
vi.mock("@/lib/wallet-send/fee-address", () => ({
  resolveWalletSendFeeSolanaAddress: () => "fee-wallet",
  isWalletSendFeeSolanaAddress: (address: string) => address === "fee-wallet",
}))
vi.mock("@/lib/yellowcard/yc-ledger", () => ({
  findYcCrossBorderFeeWalletRefundSuppression: mocks.feeRefund,
}))
vi.mock("@/lib/turnkey/resolve-turnkey-wallet-scope", () => ({
  resolveTurnkeyWalletScopeFromEvent: mocks.resolveScope,
  isActiveSolanaWalletAddress: mocks.isManagedVault,
}))
vi.mock("@/lib/turnkey/ledger-inbound-exists", () => ({
  turnkeyInboundLedgerRowExists: mocks.ledgerExists,
  turnkeyVisibleInboundLedgerRowExists: mocks.visibleLedgerExists,
}))
vi.mock("@/lib/turnkey/inbound-hash-visible-ledger", () => ({
  inboundHashHasVisibleLedgerCredit: mocks.inboundVisible,
}))
vi.mock("@/lib/ledger/easetag-settlement", () => ({
  easetagP2pCreditVisibleForTransferGroup: mocks.easetagCreditVisible,
}))
vi.mock("@/lib/turnkey/apply-turnkey-inbound-ledger", () => ({
  applyTurnkeyInboundLedgerEvent: mocks.applyInbound,
}))
vi.mock("@/lib/solana/rpc-connection", () => ({
  createSolanaRpcConnection: () => ({}),
  isSolanaRpcRateLimitedError: () => false,
}))
vi.mock("@/lib/solana/spl-mints", () => ({
  mintForStablecoinAsset: () => null,
}))
vi.mock("@/lib/grid/grid-va-sweep-treasury", () => ({
  isGridVaSweepTreasurySender: (...args: unknown[]) => mocks.isGridTreasury(...args),
}))
vi.mock("@/lib/grid/grid-bank-deposit-chain-suppression", () => ({
  gridVaInboundCreditVisible: (...args: unknown[]) => mocks.gridVisible(...args),
}))
vi.mock("@/lib/grid/grid-va-turnkey-dust", () => ({
  isGridVaTurnkeyDustAmount: (amount: number) => Number.isFinite(amount) && amount > 0 && amount < 0.01,
}))

import { applyTurnkeyBalanceWebhookSideEffects } from "@/lib/turnkey/balance-webhook-sync"

const deposit = {
  address: "J8Xh2H1WLd252soocN2r3R3CbgadA5Rq9LBMvXkUyDVA",
  txHash: "hash-organic",
  amount: 1,
  asset: "USDC",
  decimals: 6,
  amountMinor: "1000000",
  occurredAt: new Date().toISOString(),
  settledAt: new Date().toISOString(),
  counterpartyAddress: null,
  raw: { msg: { txHash: "hash-organic" } },
}

describe("applyTurnkeyBalanceWebhookSideEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isEnabled.mockReturnValue(true)
    mocks.isOmnibus.mockReturnValue(false)
    mocks.feeRefund.mockResolvedValue(null)
    mocks.ledgerExists.mockResolvedValue(false)
    mocks.visibleLedgerExists.mockResolvedValue(false)
    mocks.inboundVisible.mockResolvedValue(false)
    mocks.easetagCreditVisible.mockResolvedValue(false)
    mocks.gridVisible.mockResolvedValue(false)
    mocks.isGridTreasury.mockReturnValue(false)
    mocks.isManagedVault.mockResolvedValue(false)
    mocks.resolveScope.mockResolvedValue({
      userId: "user-1",
      businessId: "biz-1",
      walletAddress: deposit.address,
      tokenAccountAddress: "ata-1",
      walletAccount: { id: "wa-1", asset: "USDC", chain: "solana" },
    })
  })

  it("retries organic stablecoin deposit when weak suppressors leave no visible ledger row", async () => {
    mocks.applyInbound
      .mockResolvedValueOnce({ kind: "suppressed_noah", allowOrganicFallback: true })
      .mockResolvedValueOnce({ kind: "applied", transactionId: "tx-organic" })
    mocks.inboundVisible
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const ok = await applyTurnkeyBalanceWebhookSideEffects({ from: vi.fn() } as never, deposit, "ev-1")
    expect(ok).toBe(true)
    expect(mocks.applyInbound).toHaveBeenCalledTimes(2)
    expect(mocks.applyInbound.mock.calls[1]?.[2]).toEqual({ forceOrganicStablecoinDeposit: true })
  })

  it("forces visible stablecoin deposit when apply returns skipped without feed credit", async () => {
    mocks.applyInbound
      .mockResolvedValueOnce({ kind: "skipped" })
      .mockResolvedValueOnce({ kind: "applied", transactionId: "tx-ensure" })
    mocks.inboundVisible
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const ok = await applyTurnkeyBalanceWebhookSideEffects({ from: vi.fn() } as never, deposit, "ev-1b")
    expect(ok).toBe(true)
    expect(mocks.applyInbound).toHaveBeenCalledTimes(2)
    expect(mocks.applyInbound.mock.calls[1]?.[2]).toEqual({
      forceOrganicStablecoinDeposit: true,
      skipBalanceDelta: false,
    })
  })

  it("throws when hash-proven suppressors leave no visible ledger row", async () => {
    mocks.applyInbound.mockResolvedValueOnce({ kind: "suppressed_noah", allowOrganicFallback: false })
    mocks.inboundVisible.mockResolvedValue(false)

    await expect(
      applyTurnkeyBalanceWebhookSideEffects({ from: vi.fn() } as never, deposit, "ev-2"),
    ).rejects.toThrow("turnkey_balance_webhook_product_reconcile_pending")
    expect(mocks.applyInbound).toHaveBeenCalledTimes(1)
  })

  it("throws when weak suppressors leave no visible ledger and organic retry still fails", async () => {
    mocks.applyInbound
      .mockResolvedValueOnce({ kind: "suppressed_easetag", allowOrganicFallback: true, easetagTransferGroupId: "tg-x" })
      .mockResolvedValueOnce({ kind: "suppressed_easetag", allowOrganicFallback: true, easetagTransferGroupId: "tg-x" })
    mocks.inboundVisible.mockResolvedValue(false)
    mocks.easetagCreditVisible.mockResolvedValue(false)

    await expect(
      applyTurnkeyBalanceWebhookSideEffects({ from: vi.fn() } as never, deposit, "ev-2b"),
    ).rejects.toThrow("turnkey_balance_webhook_no_ledger")
  })

  it("accepts easetag suppression when payee credit exists without chain tx_hash yet", async () => {
    mocks.applyInbound.mockResolvedValueOnce({
      kind: "suppressed_easetag",
      allowOrganicFallback: false,
      easetagTransferGroupId: "tg-easetag",
    })
    mocks.inboundVisible.mockResolvedValue(false)
    mocks.easetagCreditVisible.mockResolvedValueOnce(true)

    const ok = await applyTurnkeyBalanceWebhookSideEffects({ from: vi.fn() } as never, deposit, "ev-4")
    expect(ok).toBe(true)
    expect(mocks.applyInbound).toHaveBeenCalledTimes(1)
    expect(mocks.easetagCreditVisible).toHaveBeenCalledWith(expect.anything(), "tg-easetag")
  })

  it("accepts suppression when another visible ledger credit exists for the hash", async () => {
    mocks.inboundVisible.mockResolvedValueOnce(true)

    const ok = await applyTurnkeyBalanceWebhookSideEffects({ from: vi.fn() } as never, deposit, "ev-3")
    expect(ok).toBe(true)
    expect(mocks.applyInbound).not.toHaveBeenCalled()
  })

  it("creates a stablecoin deposit on the fee wallet when the inbound is not a YC refund", async () => {
    mocks.applyInbound.mockResolvedValue({ kind: "applied", transactionId: "tx-fee" })
    mocks.inboundVisible.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const ok = await applyTurnkeyBalanceWebhookSideEffects(
      { from: vi.fn() } as never,
      { ...deposit, address: "fee-wallet" },
      "ev-fee",
    )
    expect(ok).toBe(true)
    expect(mocks.applyInbound).toHaveBeenCalled()
    expect(mocks.feeRefund).toHaveBeenCalled()
  })

  it("does not swallow a customer vault fee sweep as a Yellowcard refund", async () => {
    mocks.isManagedVault.mockResolvedValue(true)
    mocks.feeRefund.mockResolvedValue({ transferId: "yc-cb-1", transactionId: "tx-cb" })
    mocks.applyInbound.mockResolvedValue({ kind: "applied", transactionId: "tx-fee-sweep" })
    mocks.inboundVisible.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const ok = await applyTurnkeyBalanceWebhookSideEffects(
      { from: vi.fn() } as never,
      {
        ...deposit,
        address: "fee-wallet",
        amount: 3.671217,
        counterpartyAddress: "CustomerVault111",
      },
      "ev-fee-sweep",
    )
    expect(ok).toBe(true)
    expect(mocks.feeRefund).not.toHaveBeenCalled()
    expect(mocks.applyInbound).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amount: 3.671217,
        metadata: expect.objectContaining({ fee_wallet_revenue_sweep: true }),
      }),
      { forceOrganicStablecoinDeposit: true, skipBalanceDelta: true },
    )
  })

  it("stamps a Yellowcard refund but still posts the fee-wallet Stablecoin deposit", async () => {
    mocks.feeRefund.mockResolvedValue({ transferId: "yc-cb-1", transactionId: "tx-cb" })
    mocks.applyInbound.mockResolvedValue({ kind: "applied", transactionId: "tx-fee-refund" })
    mocks.inboundVisible.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} } }),
        update,
      })),
    }

    const ok = await applyTurnkeyBalanceWebhookSideEffects(
      admin as never,
      { ...deposit, address: "fee-wallet", amount: 12.5 },
      "ev-yc-refund",
    )
    expect(ok).toBe(true)
    expect(update).toHaveBeenCalled()
    expect(mocks.applyInbound).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amount: 12.5,
        metadata: expect.objectContaining({ fee_wallet_revenue_sweep: true }),
      }),
      { forceOrganicStablecoinDeposit: true, skipBalanceDelta: true },
    )
  })

  it("accepts Grid treasury suppress when the Grid VA bank-deposit row is already visible", async () => {
    mocks.applyInbound.mockResolvedValueOnce({ kind: "suppressed_noah", allowOrganicFallback: false })
    mocks.isGridTreasury.mockReturnValue(true)
    mocks.gridVisible.mockResolvedValue(true)
    mocks.inboundVisible.mockResolvedValue(false)

    const ok = await applyTurnkeyBalanceWebhookSideEffects(
      { from: vi.fn() } as never,
      { ...deposit, counterpartyAddress: "E6GjrWqtzTfm5ShTCxpphBzEuNt22goKDUKspkA9tJ3U" },
      "ev-grid",
    )
    expect(ok).toBe(true)
    expect(mocks.applyInbound).toHaveBeenCalledTimes(1)
  })
})

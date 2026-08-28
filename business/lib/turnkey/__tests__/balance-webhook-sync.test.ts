import { describe, expect, it, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  applyInbound: vi.fn(),
  inboundVisible: vi.fn(),
  resolveScope: vi.fn(),
  isEnabled: vi.fn(),
  isOmnibus: vi.fn(),
  handleOmnibus: vi.fn(),
  feeRefund: vi.fn(),
  ledgerExists: vi.fn(),
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
}))
vi.mock("@/lib/yellowcard/yc-ledger", () => ({
  findYcCrossBorderFeeWalletRefundSuppression: mocks.feeRefund,
}))
vi.mock("@/lib/turnkey/resolve-turnkey-wallet-scope", () => ({
  resolveTurnkeyWalletScopeFromEvent: mocks.resolveScope,
}))
vi.mock("@/lib/turnkey/ledger-inbound-exists", () => ({
  turnkeyInboundLedgerRowExists: mocks.ledgerExists,
}))
vi.mock("@/lib/turnkey/inbound-hash-visible-ledger", () => ({
  inboundHashHasVisibleLedgerCredit: mocks.inboundVisible,
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
    mocks.inboundVisible.mockResolvedValue(false)
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

    const ok = await applyTurnkeyBalanceWebhookSideEffects({ from: vi.fn() } as never, deposit, "ev-1")
    expect(ok).toBe(true)
    expect(mocks.applyInbound).toHaveBeenCalledTimes(2)
    expect(mocks.applyInbound.mock.calls[1]?.[2]).toEqual({ forceOrganicStablecoinDeposit: true })
  })

  it("throws when hash-proven suppressors leave no visible ledger row", async () => {
    mocks.applyInbound.mockResolvedValueOnce({ kind: "suppressed_noah", allowOrganicFallback: false })

    await expect(
      applyTurnkeyBalanceWebhookSideEffects({ from: vi.fn() } as never, deposit, "ev-2"),
    ).rejects.toThrow("turnkey_balance_webhook_product_reconcile_pending")
    expect(mocks.applyInbound).toHaveBeenCalledTimes(1)
  })

  it("throws when weak suppressors leave no visible ledger and organic retry still fails", async () => {
    mocks.applyInbound
      .mockResolvedValueOnce({ kind: "suppressed_easetag", allowOrganicFallback: true })
      .mockResolvedValueOnce({ kind: "suppressed_easetag", allowOrganicFallback: true })

    await expect(
      applyTurnkeyBalanceWebhookSideEffects({ from: vi.fn() } as never, deposit, "ev-2b"),
    ).rejects.toThrow("turnkey_balance_webhook_no_ledger")
  })

  it("accepts suppression when another visible ledger credit exists for the hash", async () => {
    mocks.applyInbound.mockResolvedValueOnce({ kind: "suppressed_noah" })
    mocks.inboundVisible.mockResolvedValueOnce(true)

    const ok = await applyTurnkeyBalanceWebhookSideEffects({ from: vi.fn() } as never, deposit, "ev-3")
    expect(ok).toBe(true)
    expect(mocks.applyInbound).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  findNoah: vi.fn(),
  findPendingNoah: vi.fn(),
  findRefund: vi.fn(),
  findGlobalPayoutSettlement: vi.fn(),
  reconcileNoah: vi.fn(),
  linkNoahPayInHash: vi.fn(),
  findRelay: vi.fn(),
  reconcileRelay: vi.fn(),
  findEasetag: vi.fn(),
  updateEasetag: vi.fn(),
  upsertLedger: vi.fn(),
  applyDelta: vi.fn(),
  enqueueSweep: vi.fn(),
  findGridVa: vi.fn(),
  findPendingGridVa: vi.fn(),
  findPendingGridSweep: vi.fn(),
  reconcileGridVa: vi.fn(),
  settleGridSweep: vi.fn(),
}))

vi.mock("@/lib/noah/noah-bank-onramp-chain-suppression", () => ({
  findNoahBankOnrampChainSettlementForSuppression: mocks.findNoah,
  findPendingNoahBankOnrampForInboundAmount: mocks.findPendingNoah,
}))
vi.mock("@/lib/noah/credit-bank-onramp-wallet", () => ({
  reconcileNoahBankOnrampCreditForSolanaTx: mocks.reconcileNoah,
  linkBankOnrampPayInToSolanaTxHash: mocks.linkNoahPayInHash,
}))
vi.mock("@/lib/ledger/easetag-settlement", () => ({
  findEasetagSettlementForChainSuppression: mocks.findEasetag,
  updateEasetagSettlementSettled: mocks.updateEasetag,
}))
vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: mocks.upsertLedger,
}))
vi.mock("@/lib/wallet/wallet-balances-db", () => ({
  applyWalletBalanceDelta: mocks.applyDelta,
}))
vi.mock("@/lib/liquidity/sweep-jobs", () => ({
  enqueueLiquiditySweepJob: mocks.enqueueSweep,
}))
vi.mock("@/lib/liquidity/platform-pool", () => ({
  ledgerCurrencyForStablecoinAsset: () => "USD",
  resolvePooledSolanaSourceAddress: async () => null,
}))
vi.mock("@/lib/noah/global-payout-ledger", () => ({
  findGlobalPayoutRefundForInboundSuppression: mocks.findRefund,
  findGlobalPayoutSettlementForChainSuppression: mocks.findGlobalPayoutSettlement,
  persistGlobalPayoutRefundTxHashOnOutRow: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/deposit-omnibus/execute-deposit-split", () => ({
  tryCompleteDepositSplitFromUserVaultInbound: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/yellowcard/yc-ledger", () => ({
  findYcFundBalanceChainSettlementForSuppression: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/yellowcard/execute-yc-fund-balance-split", () => ({
  tryCompleteYcFundBalanceFromUserVaultInbound: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/deposit-omnibus/config", () => ({
  isDepositSplitEnabled: () => false,
}))
vi.mock("@/lib/relay-deposit/relay-deposit-suppression", () => ({
  findRelayDepositChainSettlementForSuppression: mocks.findRelay,
}))
vi.mock("@/lib/relay-deposit/settle-relay-deposit", () => ({
  reconcileRelayDepositCreditForSolanaTx: mocks.reconcileRelay,
}))
vi.mock("@/lib/grid/grid-bank-deposit-chain-suppression", () => ({
  findGridVaBankDepositChainSettlementForSuppression: mocks.findGridVa,
  findPendingGridVaBankDepositForInboundAmount: mocks.findPendingGridVa,
}))
vi.mock("@/lib/grid/grid-bank-deposit-credit", () => ({
  reconcileGridVaBankDepositCreditForSolanaTx: mocks.reconcileGridVa,
}))
vi.mock("@/lib/grid/va-turnkey-sweep", () => ({
  findPendingGridVaTurnkeySweepForInboundAmount: mocks.findPendingGridSweep,
  settleGridVaTurnkeySweepForSolanaTx: mocks.settleGridSweep,
}))
vi.mock("@/lib/turnkey/ledger-inbound-exists", () => ({
  turnkeyInboundLedgerRowExists: vi.fn().mockResolvedValue(false),
}))

import { applyTurnkeyInboundLedgerEvent } from "@/lib/turnkey/apply-turnkey-inbound-ledger"
import { turnkeyInboundLedgerRowExists } from "@/lib/turnkey/ledger-inbound-exists"
import { findYcFundBalanceChainSettlementForSuppression } from "@/lib/yellowcard/yc-ledger"
import { tryCompleteYcFundBalanceFromUserVaultInbound } from "@/lib/yellowcard/execute-yc-fund-balance-split"

const baseInput = {
  userId: "user-1",
  businessId: null as string | null,
  walletAccount: {
    id: "wa-1",
    address: "Owner111",
    asset: "USDC",
    chain: "solana",
    associated_token_account_address: "Ata111",
  },
  providerTransactionId: "pt-1",
  providerEventId: "ev-1",
  status: "settled" as const,
  amount: 10,
  currency: "USD",
  direction: "in" as const,
  payload: {},
  metadata: { source: "turnkey_balance_webhook" },
  txHash: "hash-noah",
  walletAddress: "Owner111",
  counterpartyAddress: null,
  occurredAt: new Date().toISOString(),
  settledAt: new Date().toISOString(),
  asset: "USDC",
  chain: "solana",
  amountMinor: "10000000",
}

describe("applyTurnkeyInboundLedgerEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findNoah.mockResolvedValue(null)
    mocks.findPendingNoah.mockResolvedValue(null)
    mocks.findRefund.mockResolvedValue(null)
    mocks.findGlobalPayoutSettlement.mockResolvedValue(null)
    mocks.findEasetag.mockResolvedValue(null)
    mocks.updateEasetag.mockResolvedValue(undefined)
    mocks.upsertLedger.mockResolvedValue({
      transactionId: "tx-1",
      inserted: true,
      becameSettled: true,
    })
    mocks.reconcileNoah.mockResolvedValue({ credited: true })
    mocks.linkNoahPayInHash.mockResolvedValue(undefined)
    mocks.findRelay.mockResolvedValue(null)
    mocks.reconcileRelay.mockResolvedValue({ credited: false })
    mocks.findGridVa.mockResolvedValue(null)
    mocks.findPendingGridVa.mockResolvedValue(null)
    mocks.findPendingGridSweep.mockResolvedValue(null)
    mocks.reconcileGridVa.mockResolvedValue({ credited: false })
    mocks.settleGridSweep.mockResolvedValue(undefined)
  })

  it("suppresses relay Tron vault inbound and reconciles relay credit", async () => {
    mocks.findRelay.mockResolvedValue({
      reason: "relay_vault_inbound",
      recipientVaultAta: "Ata111",
      tronAddress: "T123",
    })
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      txHash: "hash-relay-fill",
    })
    expect(result.kind).toBe("suppressed_noah")
    expect(mocks.reconcileRelay).toHaveBeenCalledWith(admin, {
      solanaTxHash: "hash-relay-fill",
      userId: "user-1",
      businessId: null,
      inboundAmount: 10,
      recipientVaultAta: "Ata111",
    })
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
  })

  it("suppresses Noah bank on-ramp hash and reconciles credit", async () => {
    mocks.findNoah.mockResolvedValue({ linkedTransactionId: "noah-1", kind: "pay_in" })
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        update: vi.fn().mockReturnThis(),
      })),
    }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, baseInput)
    expect(result.kind).toBe("suppressed_noah")
    expect(mocks.reconcileNoah).toHaveBeenCalledWith(admin, {
      solanaTxHash: "hash-noah",
      userId: "user-1",
      businessId: null,
    })
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
  })

  it("suppresses pending Noah pay-in by amount before on-chain hash is linked", async () => {
    mocks.findPendingNoah.mockResolvedValue({
      payInTransactionId: "noah-pay-1",
      ruleExecutionId: "rule-1",
    })
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, baseInput)
    expect(result.kind).toBe("suppressed_noah")
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
    expect(mocks.linkNoahPayInHash).toHaveBeenCalledWith(admin, {
      ruleExecutionId: "rule-1",
      solanaTxHash: "hash-noah",
      userId: "user-1",
      businessId: null,
    })
    expect(mocks.reconcileNoah).toHaveBeenCalled()
  })

  it("suppresses global payout refund mirror without upsert", async () => {
    mocks.findRefund.mockResolvedValue({
      easnerPayoutId: "payout-1",
      outRowId: "out-1",
    })
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, baseInput)
    expect(result.kind).toBe("suppressed_noah")
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
    expect(mocks.applyDelta).not.toHaveBeenCalled()
  })

  it("skips duplicate settled inbound when tx_hash already in ledger", async () => {
    vi.mocked(turnkeyInboundLedgerRowExists).mockResolvedValueOnce(true)
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, baseInput)
    expect(result.kind).toBe("skipped")
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
    expect(mocks.applyDelta).not.toHaveBeenCalled()
  })

  it("suppresses Easetag settlement without upsert", async () => {
    mocks.findEasetag.mockResolvedValue({
      transfer_group_id: "tg-1",
      status: "submitted",
    })
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, baseInput)
    expect(result.kind).toBe("suppressed_easetag")
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
    expect(mocks.updateEasetag).toHaveBeenCalled()
  })

  it("suppresses pending Grid VA Turnkey sweep and settles hash", async () => {
    mocks.findPendingGridSweep.mockResolvedValue({ transferId: "sweep-1" })
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      businessId: "biz-1",
      txHash: "hash-grid-sweep",
    })
    expect(result.kind).toBe("suppressed_noah")
    expect(mocks.settleGridSweep).toHaveBeenCalledWith(admin, {
      transferId: "sweep-1",
      solanaTxHash: "hash-grid-sweep",
    })
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
  })

  it("settles the Grid VA sweep when a pending bank deposit matches first", async () => {
    mocks.findPendingGridVa.mockResolvedValue({
      transactionId: "grid-pay-1",
      gridTransactionId: "Transaction:in-1",
    })
    mocks.findPendingGridSweep.mockResolvedValue({ transferId: "sweep-2" })
    const admin = {
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({}),
      })),
    }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      businessId: "biz-1",
      txHash: "hash-grid-payin",
    })
    expect(result.kind).toBe("suppressed_noah")
    expect(mocks.reconcileGridVa).toHaveBeenCalled()
    expect(mocks.settleGridSweep).toHaveBeenCalledWith(admin, {
      transferId: "sweep-2",
      solanaTxHash: "hash-grid-payin",
    })
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
  })

  it("suppresses YC fund balance vault delivery without upsert", async () => {
    vi.mocked(findYcFundBalanceChainSettlementForSuppression).mockResolvedValueOnce(true)
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      txHash: "hash-yc-vault",
    })
    expect(result.kind).toBe("suppressed_noah")
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
  })

  it("completes YC fund balance split from vault inbound", async () => {
    vi.mocked(tryCompleteYcFundBalanceFromUserVaultInbound).mockResolvedValueOnce(true)
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      txHash: "hash-yc-vault",
      amount: 1.781872,
    })
    expect(result.kind).toBe("suppressed_noah")
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
    expect(tryCompleteYcFundBalanceFromUserVaultInbound).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        txHash: "hash-yc-vault",
        amount: 1.781872,
      }),
    )
  })
})

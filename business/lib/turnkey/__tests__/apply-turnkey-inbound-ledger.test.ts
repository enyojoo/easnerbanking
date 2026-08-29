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
  findPendingGridRefundSweep: vi.fn(),
  settleGridRefundSweep: vi.fn(),
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
  patchEasetagP2pChainSettlement: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/ledger/easetag-turnkey-mirror", () => ({
  suppressTurnkeyEasetagChainMirrorRow: vi.fn().mockResolvedValue({ suppressed: 0, reversedBalance: 0 }),
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
vi.mock("@/lib/stripe/onramp-ledger", () => ({
  findStripeOnrampChainSettlementForSuppression: vi.fn().mockResolvedValue(false),
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
vi.mock("@/lib/grid/grid-va-turnkey-dust", () => ({
  GRID_VA_TURNKEY_DUST_MAX_USD: 0.01,
  isGridVaTurnkeyDustAmount: (amount: number) => Number.isFinite(amount) && amount > 0 && amount < 0.01,
}))
vi.mock("@/lib/grid/grid-bank-deposit-credit", () => ({
  reconcileGridVaBankDepositCreditForSolanaTx: mocks.reconcileGridVa,
}))
vi.mock("@/lib/grid/va-turnkey-sweep", () => ({
  findPendingGridVaTurnkeySweepForInboundAmount: mocks.findPendingGridSweep,
  findGridVaTurnkeySweepForSolanaTx: vi.fn().mockResolvedValue(null),
  settleGridVaTurnkeySweepForSolanaTx: mocks.settleGridSweep,
  suppressTurnkeyGridVaChainMirrorRow: vi.fn().mockResolvedValue({ suppressed: 0, reversedBalance: 0 }),
}))
vi.mock("@/lib/grid/payout-refund-sweep", () => ({
  findPendingGridPayoutRefundSweepForInboundAmount: mocks.findPendingGridRefundSweep,
  settleGridPayoutRefundSweepForSolanaTx: mocks.settleGridRefundSweep,
}))
vi.mock("@/lib/turnkey/ledger-inbound-exists", () => ({
  turnkeyInboundLedgerRowExists: vi.fn().mockResolvedValue(false),
}))

import { applyTurnkeyInboundLedgerEvent } from "@/lib/turnkey/apply-turnkey-inbound-ledger"
import { turnkeyInboundLedgerRowExists } from "@/lib/turnkey/ledger-inbound-exists"
import { findGridVaTurnkeySweepForSolanaTx } from "@/lib/grid/va-turnkey-sweep"
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
    mocks.findPendingGridRefundSweep.mockResolvedValue(null)
    mocks.settleGridRefundSweep.mockResolvedValue(undefined)
  })

  it("allows organic fallback for relay pending amount match only", async () => {
    mocks.findRelay.mockResolvedValue({
      reason: "pending_deposit",
      relayDepositId: "relay-pending",
    })
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      txHash: "hash-relay-pending",
    })
    expect(result).toEqual({ kind: "suppressed_noah", allowOrganicFallback: true })
  })

  it("disallows organic fallback for relay fill hash match", async () => {
    mocks.findRelay.mockResolvedValue({
      reason: "fill_hash",
      relayDepositId: "relay-1",
    })
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      txHash: "hash-relay-fill",
    })
    expect(result).toEqual({ kind: "suppressed_noah", allowOrganicFallback: false })
  })

  it("suppresses relay Tron vault inbound and reconciles relay credit", async () => {
    mocks.findRelay.mockResolvedValue({
      reason: "pending_deposit",
      relayDepositId: "relay-1",
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

  it("records stablecoin deposit when pending Noah pay-in only matches by amount", async () => {
    mocks.findPendingNoah.mockResolvedValue({
      payInTransactionId: "noah-pay-1",
      ruleExecutionId: "rule-1",
    })
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} } }),
        update: vi.fn().mockReturnThis(),
      })),
    }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, baseInput)
    expect(result.kind).toBe("applied")
    expect(mocks.upsertLedger).toHaveBeenCalled()
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
    expect(result).toEqual({
      kind: "suppressed_easetag",
      allowOrganicFallback: false,
      easetagTransferGroupId: "tg-1",
    })
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
    expect(mocks.updateEasetag).toHaveBeenCalled()
  })

  it("records stablecoin deposit when only an amount-matching sweep exists", async () => {
    mocks.findPendingGridSweep.mockResolvedValue({ transferId: "sweep-1" })
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} } }),
        update: vi.fn().mockReturnThis(),
      })),
    }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      businessId: "biz-1",
      txHash: "hash-grid-sweep",
    })
    expect(result.kind).toBe("applied")
    expect(mocks.settleGridSweep).not.toHaveBeenCalled()
    expect(mocks.upsertLedger).toHaveBeenCalled()
  })

  it("suppresses settled Grid VA sweep by tx hash when webhook amount is dust", async () => {
    vi.mocked(findGridVaTurnkeySweepForSolanaTx).mockResolvedValueOnce({ transferId: "sweep-settled" })
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      businessId: "biz-1",
      amount: 0.0001,
      txHash: "hash-grid-dust",
    })
    expect(result.kind).toBe("suppressed_noah")
    expect(findGridVaTurnkeySweepForSolanaTx).toHaveBeenCalledWith(admin, {
      txHash: "hash-grid-dust",
      businessId: "biz-1",
      userId: "user-1",
      amount: 0.0001,
    })
    expect(mocks.settleGridSweep).toHaveBeenCalledWith(admin, {
      transferId: "sweep-settled",
      solanaTxHash: "hash-grid-dust",
      inboundAmount: 0.0001,
    })
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
  })

  it("skips sub-cent inbound when no Grid VA sweep matches", async () => {
    const admin = { from: vi.fn() }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      businessId: "biz-1",
      amount: 0.001,
      txHash: "hash-zero-row",
    })
    expect(result.kind).toBe("skipped")
    expect(mocks.upsertLedger).not.toHaveBeenCalled()
    expect(mocks.applyDelta).not.toHaveBeenCalled()
  })

  it("records stablecoin deposit when pending bank deposit only matches by amount", async () => {
    mocks.findPendingGridVa.mockResolvedValue({
      transactionId: "grid-pay-1",
      gridTransactionId: "Transaction:in-1",
    })
    mocks.findPendingGridSweep.mockResolvedValue({ transferId: "sweep-2" })
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} } }),
        update: vi.fn().mockReturnThis(),
      })),
    }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, {
      ...baseInput,
      businessId: "biz-1",
      txHash: "hash-grid-payin",
    })
    expect(result.kind).toBe("applied")
    expect(mocks.reconcileGridVa).not.toHaveBeenCalled()
    expect(mocks.settleGridSweep).not.toHaveBeenCalled()
    expect(mocks.upsertLedger).toHaveBeenCalled()
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

  it("forceOrganicStablecoinDeposit bypasses product suppressors", async () => {
    mocks.findNoah.mockResolvedValue({ linkedTransactionId: "noah-1", kind: "pay_in" })
    mocks.findEasetag.mockResolvedValue({ transfer_group_id: "tg-1", status: "submitted" })
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} } }),
        update: vi.fn().mockReturnThis(),
      })),
    }

    const result = await applyTurnkeyInboundLedgerEvent(admin as never, baseInput, {
      forceOrganicStablecoinDeposit: true,
    })
    expect(result.kind).toBe("applied")
    expect(mocks.reconcileNoah).not.toHaveBeenCalled()
    expect(mocks.findEasetag).not.toHaveBeenCalled()
    expect(mocks.upsertLedger).toHaveBeenCalled()
  })
})

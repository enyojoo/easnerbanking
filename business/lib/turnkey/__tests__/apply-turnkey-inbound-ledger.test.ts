import { describe, expect, it, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  findNoah: vi.fn(),
  findPendingNoah: vi.fn(),
  reconcileNoah: vi.fn(),
  findEasetag: vi.fn(),
  updateEasetag: vi.fn(),
  upsertLedger: vi.fn(),
  applyDelta: vi.fn(),
  enqueueSweep: vi.fn(),
}))

vi.mock("@/lib/noah/noah-bank-onramp-chain-suppression", () => ({
  findNoahBankOnrampChainSettlementForSuppression: mocks.findNoah,
  findPendingNoahBankOnrampForInboundAmount: mocks.findPendingNoah,
}))
vi.mock("@/lib/noah/credit-bank-onramp-wallet", () => ({
  reconcileNoahBankOnrampCreditForSolanaTx: mocks.reconcileNoah,
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

import { applyTurnkeyInboundLedgerEvent } from "@/lib/turnkey/apply-turnkey-inbound-ledger"

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
    mocks.findEasetag.mockResolvedValue(null)
    mocks.updateEasetag.mockResolvedValue(undefined)
    mocks.upsertLedger.mockResolvedValue({
      transactionId: "tx-1",
      inserted: true,
      becameSettled: true,
    })
    mocks.reconcileNoah.mockResolvedValue({ credited: true })
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
    expect(mocks.reconcileNoah).toHaveBeenCalled()
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
})

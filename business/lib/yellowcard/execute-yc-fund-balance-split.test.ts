import { describe, expect, it, vi, beforeEach } from "vitest"

const sendStablecoinFromDepositOmnibus = vi.fn()
const sweepEasnerRevenueFromDepositOmnibus = vi.fn()
const resolveActiveUsdcSolanaAddress = vi.fn()
const applyWalletBalanceDelta = vi.fn()
const upsertLedgerTransaction = vi.fn()
const notifyYcFundBalanceSettledPush = vi.fn()

vi.mock("@/lib/turnkey/send-from-omnibus", () => ({
  sendStablecoinFromDepositOmnibus: (...args: unknown[]) => sendStablecoinFromDepositOmnibus(...args),
}))

vi.mock("@/lib/processing-fee/fee-wallet-sweep", () => ({
  readPriorSweepFromMetadata: () => ({ captured: false }),
  sweepEasnerRevenueFromDepositOmnibus: (...args: unknown[]) =>
    sweepEasnerRevenueFromDepositOmnibus(...args),
}))

vi.mock("@/lib/wallet/resolve-active-usdc-solana-address", () => ({
  resolveActiveUsdcSolanaAddress: (...args: unknown[]) => resolveActiveUsdcSolanaAddress(...args),
}))

vi.mock("@/lib/wallet/wallet-balances-db", () => ({
  applyWalletBalanceDelta: (...args: unknown[]) => applyWalletBalanceDelta(...args),
}))

vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: (...args: unknown[]) => upsertLedgerTransaction(...args),
}))

vi.mock("@/lib/notifications/bank-deposit-settled-notify", () => ({
  notifyYcFundBalanceSettledPush: (...args: unknown[]) => notifyYcFundBalanceSettledPush(...args),
}))

import {
  triggerYcFundBalanceOmnibusSplit,
  computeYcFundBalanceEconomics,
} from "./execute-yc-fund-balance-split"

const baseTransfer = {
  id: "tr-1",
  mode: "fund_balance",
  status: "processing",
  user_id: "user-1",
  business_id: null,
  quoted_receive: 2000,
  quoted_pay_in: 265021.63,
  pay_in_currency: "KES",
  leg1_sequence_id: "yc_fb_1",
  transaction_id: "tx-1",
  settlement_info: null,
  omnibus_in_actual: null,
  metadata: {
    usd_credit: 2000,
    processing_fee: 20,
    omnibus_in_expected: 2020,
  },
}

function makeAdmin(transfer: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = []
  return {
    updates,
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: async () => {
            if (table === "yc_transfers") return { data: transfer }
            if (table === "transactions") {
              return {
                data: {
                  id: "tx-1",
                  metadata: {},
                  occurred_at: "2026-01-01T00:00:00.000Z",
                  created_at: "2026-01-01T00:00:00.000Z",
                  provider_transaction_id: "yc_fb_1",
                  amount: 2000,
                },
              }
            }
            return { data: null }
          },
          filter: () => ({
            maybeSingle: async () => ({ data: transfer }),
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(payload)
          Object.assign(transfer, payload)
          if (payload.metadata && typeof payload.metadata === "object") {
            transfer.metadata = payload.metadata
          }
          return { data: null, error: null }
        },
      }),
    }),
  } as never
}

describe("executeYcFundBalanceOmnibusSplit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveActiveUsdcSolanaAddress.mockResolvedValue("UserVault111")
    sweepEasnerRevenueFromDepositOmnibus.mockResolvedValue({ feeWalletSweepTxHash: "fee-hash" })
    applyWalletBalanceDelta.mockResolvedValue(undefined)
    upsertLedgerTransaction.mockResolvedValue({ transactionId: "tx-1" })
    notifyYcFundBalanceSettledPush.mockResolvedValue(undefined)
    sendStablecoinFromDepositOmnibus.mockResolvedValue({
      dryRun: false,
      providerTransactionId: "send-1",
      sendTransactionStatusId: null,
      status: "settled",
      txHash: "vault-hash-1",
      errorMessage: null,
    })
  })

  it("computes economics from omnibus amount", () => {
    const economics = computeYcFundBalanceEconomics({
      transfer: baseTransfer,
      omnibusAmount: 2020.5,
    })
    expect(economics.creditAmt).toBe(2000)
    expect(economics.omnibusCheckOk).toBe(true)
    expect(economics.feeSweep).toBeGreaterThan(0)
  })

  it("sends user vault + fee then finalizes ledger", async () => {
    const transfer = { ...baseTransfer, metadata: { ...baseTransfer.metadata } }
    const admin = makeAdmin(transfer)

    const result = await triggerYcFundBalanceOmnibusSplit(admin, {
      transferId: "tr-1",
      transactionId: "tx-1",
      omnibusTxHash: "omni-hash-1",
      omnibusAmount: 2020.5,
      payload: { settlementInfo: { cryptoAmount: 2020.5 } },
    })

    expect(result.ok).toBe(true)
    expect(result.finalized).toBe(true)
    expect(sendStablecoinFromDepositOmnibus).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAddress: "UserVault111",
        amount: 2000,
      }),
    )
    expect(sweepEasnerRevenueFromDepositOmnibus).toHaveBeenCalled()
    expect(applyWalletBalanceDelta).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ delta: 2000 }),
    )
    expect(notifyYcFundBalanceSettledPush).toHaveBeenCalledWith(admin, "tx-1")
  })

  it("requires omnibus tx hash before split", async () => {
    const transfer = { ...baseTransfer, metadata: { ...baseTransfer.metadata } }
    const admin = makeAdmin(transfer)

    const result = await triggerYcFundBalanceOmnibusSplit(admin, {
      transferId: "tr-1",
      transactionId: "tx-1",
      omnibusAmount: 2020.5,
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("omnibus_tx_hash_required")
    expect(sendStablecoinFromDepositOmnibus).not.toHaveBeenCalled()
  })

  it("fails when user vault is missing", async () => {
    resolveActiveUsdcSolanaAddress.mockResolvedValue(null)
    const transfer = { ...baseTransfer, metadata: { ...baseTransfer.metadata } }
    const admin = makeAdmin(transfer)

    const result = await triggerYcFundBalanceOmnibusSplit(admin, {
      transferId: "tr-1",
      transactionId: "tx-1",
      omnibusTxHash: "omni-hash-1",
      omnibusAmount: 2020.5,
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("user_vault_missing")
    expect(sendStablecoinFromDepositOmnibus).not.toHaveBeenCalled()
  })
})

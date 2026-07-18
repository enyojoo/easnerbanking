import { describe, expect, it, vi, beforeEach } from "vitest"
import { creditFundBalanceFromYcReceive } from "./fund-balance-credit"

const applyWalletBalanceDelta = vi.fn()
const sweepEasnerRevenueFromDepositOmnibus = vi.fn()
const upsertLedgerTransaction = vi.fn()

vi.mock("@/lib/wallet/wallet-balances-db", () => ({
  applyWalletBalanceDelta: (...args: unknown[]) => applyWalletBalanceDelta(...args),
}))

vi.mock("@/lib/processing-fee/fee-wallet-sweep", () => ({
  readPriorSweepFromMetadata: () => ({ captured: false }),
  sweepEasnerRevenueFromDepositOmnibus: (...args: unknown[]) =>
    sweepEasnerRevenueFromDepositOmnibus(...args),
}))

vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: (...args: unknown[]) => upsertLedgerTransaction(...args),
}))

function makeAdmin(transfer: Record<string, unknown>) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: transfer }),
        }),
      }),
      update: () => ({
        eq: async () => ({ data: null, error: null }),
      }),
    }),
  } as never
}

describe("creditFundBalanceFromYcReceive", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    applyWalletBalanceDelta.mockResolvedValue(undefined)
    sweepEasnerRevenueFromDepositOmnibus.mockResolvedValue({ feeWalletSweepTxHash: "sweep" })
    upsertLedgerTransaction.mockResolvedValue({ transactionId: "tx-1" })
  })

  it("credits full quote and sweeps fee when omnibus is sufficient", async () => {
    const transfer = {
      id: "tr-1",
      mode: "fund_balance",
      status: "awaiting_pay_in",
      user_id: "user-1",
      business_id: null,
      quoted_receive: 2000,
      quoted_pay_in: 265021.63,
      pay_in_currency: "KES",
      leg1_sequence_id: "yc_fb_1",
      transaction_id: "tx-1",
      metadata: {
        usd_credit: 2000,
        processing_fee: 20,
        margin_amount: 0.5,
        omnibus_in_expected: 2020,
      },
    }
    const admin = makeAdmin(transfer)

    const result = await creditFundBalanceFromYcReceive(admin, {
      transferId: "tr-1",
      transactionId: "tx-1",
      payload: { settlementInfo: { cryptoAmount: 2020.5 } },
    })

    expect(result).toEqual({ credited: true, creditAmt: 2000 })
    expect(applyWalletBalanceDelta).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ delta: 2000 }),
    )
    expect(sweepEasnerRevenueFromDepositOmnibus).toHaveBeenCalled()
  })

  it("does not credit when omnibus is under-funded", async () => {
    const transfer = {
      id: "tr-2",
      mode: "fund_balance",
      status: "awaiting_pay_in",
      user_id: "user-1",
      business_id: null,
      quoted_receive: 2000,
      leg1_sequence_id: "yc_fb_2",
      transaction_id: "tx-2",
      metadata: {
        usd_credit: 2000,
        processing_fee: 20,
        margin_amount: 0,
        omnibus_in_expected: 2020,
      },
    }
    const admin = makeAdmin(transfer)

    const result = await creditFundBalanceFromYcReceive(admin, {
      transferId: "tr-2",
      transactionId: "tx-2",
      payload: { settlementInfo: { cryptoAmount: 1973.97 } },
    })

    expect(result).toEqual({ credited: false, creditAmt: 0 })
    expect(applyWalletBalanceDelta).not.toHaveBeenCalled()
    expect(sweepEasnerRevenueFromDepositOmnibus).not.toHaveBeenCalled()
  })
})

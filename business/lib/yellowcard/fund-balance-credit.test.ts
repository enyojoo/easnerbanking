import { describe, expect, it, vi, beforeEach } from "vitest"

const triggerYcFundBalanceOmnibusSplit = vi.fn()

vi.mock("@/lib/yellowcard/execute-yc-fund-balance-split", () => ({
  triggerYcFundBalanceOmnibusSplit: (...args: unknown[]) => triggerYcFundBalanceOmnibusSplit(...args),
  computeYcFundBalanceEconomics: (input: {
    transfer: Record<string, unknown>
    payload?: Record<string, unknown>
    omnibusAmount?: number | null
  }) => {
    const meta = (input.transfer.metadata ?? {}) as Record<string, unknown>
    const cryptoAmount = Number(
      input.omnibusAmount ??
        input.payload?.settlementInfo?.cryptoAmount ??
        input.transfer.omnibus_in_actual ??
        0,
    )
    const quotedCredit = Number(meta.usd_credit ?? input.transfer.quoted_receive ?? 0)
    const processingFee = Number(meta.processing_fee ?? 0)
    const expectedOmnibus = Number(meta.omnibus_in_expected ?? quotedCredit + processingFee)
    return {
      cryptoAmount,
      creditAmt: quotedCredit,
      processingFee,
      expectedOmnibus,
      feeSweep: Math.max(0, cryptoAmount - quotedCredit),
      omnibusCheckOk: cryptoAmount + 0.02 >= quotedCredit + processingFee,
    }
  },
}))

vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: vi.fn().mockResolvedValue({ transactionId: "tx-1" }),
}))

import { creditFundBalanceFromYcReceive } from "./fund-balance-credit"

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
    triggerYcFundBalanceOmnibusSplit.mockResolvedValue({
      ok: true,
      finalized: true,
      creditAmt: 2000,
    })
  })

  it("delegates to omnibus split when tx hash is present", async () => {
    const transfer = {
      id: "tr-1",
      mode: "fund_balance",
      status: "processing",
      user_id: "user-1",
      business_id: null,
      quoted_receive: 2000,
      leg1_sequence_id: "yc_fb_1",
      transaction_id: "tx-1",
      metadata: {
        usd_credit: 2000,
        processing_fee: 20,
        omnibus_in_expected: 2020,
      },
    }
    const admin = makeAdmin(transfer)

    const result = await creditFundBalanceFromYcReceive(admin, {
      transferId: "tr-1",
      transactionId: "tx-1",
      payload: { settlementInfo: { cryptoAmount: 2020.5 } },
      omnibusTxHash: "omni-hash-1",
      omnibusAmount: 2020.5,
    })

    expect(result).toEqual({ credited: true, creditAmt: 2000 })
    expect(triggerYcFundBalanceOmnibusSplit).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        transferId: "tr-1",
        omnibusTxHash: "omni-hash-1",
        omnibusAmount: 2020.5,
      }),
    )
  })

  it("does not split when omnibus hash is missing", async () => {
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
        omnibus_in_expected: 2020,
      },
    }
    const admin = makeAdmin(transfer)

    const result = await creditFundBalanceFromYcReceive(admin, {
      transferId: "tr-2",
      transactionId: "tx-2",
      payload: { settlementInfo: { cryptoAmount: 2020.5 } },
    })

    expect(result).toEqual({ credited: false, creditAmt: 0 })
    expect(triggerYcFundBalanceOmnibusSplit).not.toHaveBeenCalled()
  })
})

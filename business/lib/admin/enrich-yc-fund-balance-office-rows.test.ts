import { describe, expect, it, vi } from "vitest"
import { enrichYcFundBalanceOfficeRows } from "./enrich-yc-fund-balance-office-rows"

describe("enrichYcFundBalanceOfficeRows", () => {
  it("merges local pay-in from yc_transfers when transaction metadata is USD-only", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            or: async () => ({
              data: [
                {
                  id: "transfer-1",
                  transaction_id: "tx-1",
                  quoted_pay_in: 250000,
                  pay_in_currency: "NGN",
                  quoted_receive: 150,
                  customer_rate: 1666.67,
                  leg1_sequence_id: "yc_fb_seq_1",
                  metadata: { processing_fee: 0 },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }

    const [enriched] = await enrichYcFundBalanceOfficeRows(admin as never, [
      {
        id: "tx-1",
        direction: "in",
        provider: "yellowcard",
        currency: "USD",
        amount: 150,
        metadata: {
          yc_mode: "fund_balance",
          usd_credit: 150,
        },
      },
    ])

    expect(enriched.metadata?.local_pay_in).toBe(250000)
    expect(enriched.metadata?.local_currency).toBe("NGN")
    expect(enriched.metadata?.deposit_review).toMatchObject({
      local_pay_in: 250000,
      local_currency: "NGN",
      usd_credit: 150,
    })
  })

  it("resolves transfer by leg1_sequence_id when transaction_id link is missing", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            or: async () => ({
              data: [
                {
                  id: "transfer-2",
                  transaction_id: null,
                  quoted_pay_in: 100000,
                  pay_in_currency: "NGN",
                  quoted_receive: 65,
                  customer_rate: 1538.46,
                  leg1_sequence_id: "yc_fb_seq_2",
                  metadata: { processing_fee: 0 },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }

    const [enriched] = await enrichYcFundBalanceOfficeRows(admin as never, [
      {
        id: "tx-2",
        direction: "in",
        provider: "yellowcard",
        provider_transaction_id: "yc_fb_seq_2",
        currency: "USD",
        amount: 65,
        metadata: {
          yc_mode: "fund_balance",
          yc_sequence_id: "yc_fb_seq_2",
          usd_credit: 65,
        },
      },
    ])

    expect(enriched.metadata?.local_pay_in).toBe(100000)
    expect(enriched.metadata?.local_currency).toBe("NGN")
  })

  it("skips rows that already have local pay-in metadata", async () => {
    const from = vi.fn()
    const admin = { from }

    const rows = await enrichYcFundBalanceOfficeRows(admin as never, [
      {
        id: "tx-3",
        direction: "in",
        provider: "yellowcard",
        currency: "USD",
        amount: 65,
        metadata: {
          yc_mode: "fund_balance",
          local_pay_in: 100000,
          local_currency: "NGN",
          usd_credit: 65,
        },
      },
    ])

    expect(from).not.toHaveBeenCalled()
    expect(rows[0].metadata?.local_pay_in).toBe(100000)
  })
})

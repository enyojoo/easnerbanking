import { describe, expect, it } from "vitest"
import {
  YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE,
  computeEnteredAmountForYcPayoutMin,
  computeMinReceiveForYcSendUsd,
  getYcBusinessPayoutMin,
  parseYcSendRejectedMinError,
  resolveEffectiveYcBalancePayoutMinReceive,
  validateYcBalancePayoutAmount,
} from "./yc-payout-limits"

describe("yc payout limits", () => {
  it("parses YC USD min rejection", () => {
    expect(parseYcSendRejectedMinError("amount must be more than 1 USD")).toEqual({
      minSendUsd: 1.01,
    })
  })

  it("uses separate YC business mins from Noah", () => {
    expect(getYcBusinessPayoutMin("NGN")).toBe(2000)
    expect(getYcBusinessPayoutMin("KES")).toBe(500)
    expect(getYcBusinessPayoutMin("RWF")).toBe(6000)
    expect(getYcBusinessPayoutMin("ZAR")).toBe(200)
    expect(getYcBusinessPayoutMin("TZS")).toBe(2500)
    expect(getYcBusinessPayoutMin("UGX")).toBe(15_000)
    expect(getYcBusinessPayoutMin("ZMW", "bank_transfer")).toBe(50_000)
    expect(getYcBusinessPayoutMin("ZMW", "mobile_money")).toBe(100)
  })

  it("computes NGN min from 1 USD floor at customer rate", () => {
    const min = computeMinReceiveForYcSendUsd({
      minSendUsd: YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE,
      customerRate: 1500,
      receiveCurrency: "NGN",
    })
    expect(min).toBeGreaterThanOrEqual(1515)
  })

  it("rejects 1000 NGN receive below 1 USD notional", () => {
    const limits = {
      minSendUsd: YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE,
      minLocalReceive: null,
      maxLocalReceive: null,
    }
    const result = validateYcBalancePayoutAmount({
      amountEntryMode: "receive",
      receiveAmount: 1000,
      sendAmount: 1000 / 1500,
      customerRate: 1500,
      receiveCurrency: "NGN",
      limits,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/Minimum payout/)
  })

  it("uses YC NGN product min above USD-derived floor", () => {
    const min = resolveEffectiveYcBalancePayoutMinReceive({
      customerRate: 1500,
      receiveCurrency: "NGN",
      limits: {
        minSendUsd: 1.01,
        minLocalReceive: null,
        maxLocalReceive: null,
      },
      businessMinReceive: 2000,
    })
    expect(min).toBe(2000)
  })

  it("bumps send entry to satisfy USD floor", () => {
    const next = computeEnteredAmountForYcPayoutMin({
      minReceive: 1515,
      amountEntryMode: "send",
      customerRate: 1500,
      receiveCurrency: "NGN",
      minSendUsd: 1.01,
    })
    expect(next).toBeGreaterThanOrEqual(1.01)
  })
})

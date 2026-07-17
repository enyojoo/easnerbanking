import { describe, expect, it } from "vitest"
import {
  buildLegacyNoahSettlementFromLeg,
  computePayoutQuoteDisplayProcessingFee,
  payoutReviewFeesFromQuote,
  resolvePayoutQuoteSettlement,
  type PayoutSettlementLeg,
} from "./payout-quote-settlement"

const sampleLeg: PayoutSettlementLeg = {
  totalFee: 0,
  feeCurrency: "USD",
  cryptoAuthorizedAmount: "1.456632",
  cryptoFloor: "1.456632",
  cryptoSendAmount: "1.456632",
  cryptoCurrency: "USDC",
  sessionId: "76fe97a3-7999-5378-bc3c-bd2387ed59ce",
  customerRate: 1373.03035,
  providerMid: 1379.93,
  effectiveRate: 1373.03035,
  marginCaptureMode: "surplus_send",
  channelCost: 0,
  marginAmount: 0.007283,
  customerPrincipal: 1.456632,
}

describe("resolvePayoutQuoteSettlement", () => {
  it("prefers settlement over legacy noah", () => {
    expect(
      resolvePayoutQuoteSettlement({
        settlement: sampleLeg,
        noah: buildLegacyNoahSettlementFromLeg({
          ...sampleLeg,
          sessionId: "legacy",
          cryptoFloor: "9",
          cryptoSendAmount: "9",
        }),
      })?.sessionId,
    ).toBe(sampleLeg.sessionId)
  })

  it("falls back to legacy noah block", () => {
    const resolved = resolvePayoutQuoteSettlement({
      noah: buildLegacyNoahSettlementFromLeg(sampleLeg),
    })
    expect(resolved?.cryptoFloor).toBe("1.456632")
    expect(resolved?.sessionId).toBe(sampleLeg.sessionId)
  })
})

describe("payoutReviewFeesFromQuote", () => {
  it("matches YC balance payout review footing", () => {
    const fees = payoutReviewFeesFromQuote({
      processingFee: 0.014566,
      displayChannelCost: 0.007283,
      channelCost: 0,
      ycLegFeesUsd: 0,
    })
    expect(fees.easnerProcessingFee).toBe(0.014566)
    expect(fees.channelFee).toBe(0.007283)
    expect(fees.displayProcessingFee).toBeCloseTo(0.021849, 6)
    expect(Math.round(fees.displayProcessingFee * 100) / 100).toBe(0.02)
  })
})

describe("computePayoutQuoteDisplayProcessingFee", () => {
  it("uses displayChannelCost when present", () => {
    expect(
      computePayoutQuoteDisplayProcessingFee({
        processingFee: 0.01,
        displayChannelCost: 0.005,
        channelCost: 0.99,
      }),
    ).toBe(0.015)
  })
})

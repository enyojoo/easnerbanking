import { describe, expect, it } from "vitest"
import {
  computeGlobalPayoutPricing,
  normalizeGlobalPayoutQuoteReceiveAmount,
} from "./global-payout-pricing"
import { normalizePayoutReceiveAmountForCurrency } from "./noah-send-rates"

describe("computeGlobalPayoutPricing", () => {
  const payout2 = {
    receiveAmount: 5000,
    customerRate: 1335.6388919029,
    noahMid: 1355.96793609,
    noahFloor: 4.520121,
  }

  it("computes margin and total debited for payout 2 benchmark", () => {
    const p = computeGlobalPayoutPricing(payout2)
    expect(p.customerPrincipal).toBeCloseTo(3.743527, 4)
    expect(p.midNotional).toBeCloseTo(3.687403, 4)
    expect(p.marginAmount).toBeCloseTo(0.056124, 3)
    // Explicit Easner 1% leg is added on top of the Noah floor + hidden FX margin.
    expect(p.processingFee).toBeCloseTo(p.customerPrincipal * 0.01, 6)
    expect(p.totalDebited).toBeCloseTo(4.61368, 3)
    expect(p.channelCost).toBeCloseTo(0.776594, 3)
    expect(
      p.customerPrincipal + p.channelCost + p.marginAmount + p.processingFee,
    ).toBeCloseTo(p.totalDebited, 6)
    expect(p.customerPrincipal + p.channelCost).toBeCloseTo(p.noahFloor, 6)
    // Display footing: Total = Sending + (display channel + processing fee).
    expect(p.customerPrincipal + p.displayChannelCost + p.processingFee).toBeCloseTo(
      p.totalDebited,
      6,
    )
    // Noah still receives floor + FX margin (pre-fee); only the 1% leg is skimmed to the fee wallet.
    expect(p.noahSendAmount).toBeCloseTo(p.totalDebited - p.processingFee, 6)
    expect(p.triggerAmount).toBe(4.520121)
  })

  it("split_debit sends noahFloor to Noah, not totalDebited", () => {
    const p = computeGlobalPayoutPricing({ ...payout2, marginCaptureMode: "split_debit" })
    expect(p.noahSendAmount).toBe(4.520121)
    expect(p.totalDebited).toBeCloseTo(4.61368, 3)
  })

  it("same receive from send-entry normalization at customer rate", () => {
    const p = computeGlobalPayoutPricing(payout2)
    const fromSend = normalizeGlobalPayoutQuoteReceiveAmount({
      amountEntryMode: "send",
      receiveFiatAmount: 5000,
      sendBudget: p.customerPrincipal,
      customerRate: payout2.customerRate,
      receiveCurrency: "NGN",
      normalizeReceive: normalizePayoutReceiveAmountForCurrency,
    })
    expect(fromSend).toBe(5000)
    const p2 = computeGlobalPayoutPricing({ ...payout2, receiveAmount: fromSend })
    expect(p2.customerPrincipal).toBe(p.customerPrincipal)
    expect(p2.totalDebited).toBe(p.totalDebited)
    expect(p2.marginAmount).toBe(p.marginAmount)
  })

  it("uses prepare Breakdown ChannelFee when provided", () => {
    const p = computeGlobalPayoutPricing({
      receiveAmount: 5000,
      customerRate: 1335.6388919029,
      noahMid: 1355.96793609,
      noahFloor: 4.520121,
      prepareChannelFee: 0.788,
      prepareRemaining: 3.687403,
    })
    expect(p.channelCost).toBe(0.788)
    expect(p.midNotional).toBeCloseTo(3.687403, 4)
  })

  it("matches settled NGN tx e2fd8401 ChannelFee", () => {
    const remaining = 0.737512
    const businessFee = 0.024102
    const p = computeGlobalPayoutPricing({
      receiveAmount: 1000,
      customerRate: 1000 / (remaining + businessFee),
      noahMid: 1355.9109696,
      noahFloor: 1.31932,
      prepareChannelFee: 0.557706,
      prepareRemaining: remaining,
    })
    expect(p.channelCost).toBeCloseTo(0.557706, 4)
    expect(p.marginAmount).toBeCloseTo(businessFee, 4)
    expect(
      p.customerPrincipal + p.channelCost + p.marginAmount + p.processingFee,
    ).toBeCloseTo(p.totalDebited, 6)
    expect(p.customerPrincipal + p.channelCost).toBeCloseTo(p.noahFloor, 6)
  })

  it("matches settled GHS tx 9bf22c53 ChannelFee", () => {
    const remaining = 3.289403
    const businessFee = 0.097876
    const p = computeGlobalPayoutPricing({
      receiveAmount: 40,
      customerRate: 40 / (remaining + businessFee),
      noahMid: 12.16026120725,
      noahFloor: 4.897937,
      prepareChannelFee: 1.510658,
      prepareRemaining: remaining,
    })
    expect(p.channelCost).toBeCloseTo(1.510658, 4)
    expect(p.marginAmount).toBeCloseTo(businessFee, 4)
    expect(
      p.customerPrincipal + p.channelCost + p.marginAmount + p.processingFee,
    ).toBeCloseTo(p.totalDebited, 6)
  })

  it("matches settled ZAR tx 1b06600d ChannelFee", () => {
    const remaining = 0.62536
    const businessFee = 0.025256
    const p = computeGlobalPayoutPricing({
      receiveAmount: 10,
      customerRate: 10 / (remaining + businessFee),
      noahMid: 15.9907692672,
      noahFloor: 1.653695,
      prepareChannelFee: 1.003079,
      prepareRemaining: remaining,
    })
    expect(p.channelCost).toBeCloseTo(1.003079, 4)
    expect(p.marginAmount).toBeCloseTo(businessFee, 4)
    expect(
      p.customerPrincipal + p.channelCost + p.marginAmount + p.processingFee,
    ).toBeCloseTo(p.totalDebited, 6)
  })
})

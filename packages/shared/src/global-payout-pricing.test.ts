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
    expect(p.totalDebited).toBeCloseTo(4.576245, 3)
    expect(p.channelCost).toBeCloseTo(0.832718, 3)
    expect(p.noahSendAmount).toBeCloseTo(p.totalDebited, 6)
    expect(p.triggerAmount).toBe(4.520121)
  })

  it("split_debit sends noahFloor to Noah, not totalDebited", () => {
    const p = computeGlobalPayoutPricing({ ...payout2, marginCaptureMode: "split_debit" })
    expect(p.noahSendAmount).toBe(4.520121)
    expect(p.totalDebited).toBeCloseTo(4.576245, 3)
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
})

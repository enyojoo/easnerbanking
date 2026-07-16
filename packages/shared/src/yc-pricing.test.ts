import { describe, expect, it } from "vitest"
import {
  buildYcFundBalanceDisplayFees,
  computeYcCrossBorderPricing,
  computeYcCrossBorderPricingBeforeReceive,
  computeYcFundBalancePricing,
  computeYcFundBalanceSendExactlyLocal,
  easnerFeeLocalFromUsdCredit,
  estimateYcFundBalanceReceiveLegFeesUsd,
} from "./yc-pricing"

describe("computeYcFundBalancePricing", () => {
  const base = {
    customerSellRate: 130,
    ycSellRate: 128,
    receiveLeg: {
      cryptoAmountUsd: 0,
      networkFeeAmountUsd: 0.5,
      serviceFeeAmountUsd: 0,
    },
  }

  it("usdCredit target: localPayIn includes 1% + YC fees × easner_sell", () => {
    const p = computeYcFundBalancePricing({ ...base, usdCredit: 100 })
    expect(p.processingFee).toBe(1)
    expect(p.ycLegFeesUsd).toBe(0.5)
    expect(p.localPayIn).toBe(Math.round((100 + 1 + 0.5) * 130 * 100) / 100)
    expect(p.usdCredit).toBe(100)
  })

  it("fixed localPayIn: processingFee is 1% × usdCredit, not omnibus + yc", () => {
    const creditTarget = computeYcFundBalancePricing({ ...base, usdCredit: 100 })
    const fixedPath = computeYcFundBalancePricing({
      ...base,
      localPayIn: creditTarget.localPayIn,
    })
    expect(fixedPath.processingFee).toBe(creditTarget.processingFee)
    expect(fixedPath.usdCredit).toBeCloseTo(creditTarget.usdCredit, 2)
    expect(fixedPath.processingFee).toBeCloseTo(fixedPath.usdCredit * 0.01, 6)
    expect(fixedPath.processingFee).not.toBeCloseTo(
      (fixedPath.omnibusInUsd + fixedPath.ycLegFeesUsd) * 0.01,
      4,
    )
  })

  it("after YC receive: locked usdCredit keeps send exactly = credit×rate + fees", () => {
    const p = computeYcFundBalancePricing({
      usdCredit: 100,
      customerSellRate: 128.68341708543,
      ycSellRate: 127,
      receiveLeg: {
        cryptoAmountUsd: 0,
        networkFeeAmountUsd: 1.96,
        serviceFeeAmountUsd: 0,
      },
    })
    const fees = buildYcFundBalanceDisplayFees({
      usdCredit: p.usdCredit,
      processingFee: p.processingFee,
      ycLegFeesUsd: p.ycLegFeesUsd,
      easnerSellRate: 128.68341708543,
      payInCurrency: "KES",
    })
    expect(p.usdCredit).toBe(100)
    expect(p.localPayIn).toBe(Math.round((100 + 1 + 1.96) * 128.68341708543 * 100) / 100)
    expect(p.localPayIn).toBeGreaterThan(12997.03)
    expect(computeYcFundBalanceSendExactlyLocal({
      usdCredit: p.usdCredit,
      customerSellRate: 128.68341708543,
      displayProcessingFeeLocal: fees.displayProcessingFeeLocal,
    })).toBe(p.localPayIn)
  })

  it("estimateYcFundBalanceReceiveLegFeesUsd pads above spread-only guess", () => {
    const estimate = estimateYcFundBalanceReceiveLegFeesUsd({
      usdCredit: 100,
      customerSellRate: 128.68341708543,
      ycSellRate: 127,
    })
    expect(estimate).toBeGreaterThanOrEqual(1.96)
  })
})

describe("computeYcCrossBorderPricingBeforeReceive", () => {
  it("pads localPayIn above send-only preview for locked receive", () => {
    const sendLeg = {
      cryptoAmountUsd: 77.5,
      networkFeeAmountUsd: 0.8,
      serviceFeeAmountUsd: 0.2,
    }
    const preview = computeYcCrossBorderPricing({
      receiveAmount: 10000,
      customerRate: 128.68,
      ycSellFrom: 127,
      ycBuyTo: 130,
      receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
      sendLeg,
    })
    const padded = computeYcCrossBorderPricingBeforeReceive({
      receiveAmount: 10000,
      customerRate: 128.68,
      ycSellFrom: 127,
      ycBuyTo: 130,
      easnerSellFrom: 128.68,
      sendLeg,
    })
    expect(padded.receiveAmount).toBe(10000)
    expect(padded.localPayIn).toBeGreaterThan(preview.localPayIn)
    expect(padded.ycLegFeesUsd).toBeGreaterThan(preview.ycLegFeesUsd)
  })
})

describe("buildYcFundBalanceDisplayFees", () => {
  it("display fee local = easner leg on credit + yc fees in local", () => {
    const fees = buildYcFundBalanceDisplayFees({
      usdCredit: 100,
      processingFee: 1,
      ycLegFeesUsd: 0.5,
      easnerSellRate: 130,
      payInCurrency: "KES",
    })
    expect(fees.displayProcessingFee).toBe(1.5)
    expect(fees.displayProcessingFeeLocal).toBe(
      easnerFeeLocalFromUsdCredit(100, 130) + Math.round(0.5 * 130 * 100) / 100,
    )
    expect(fees.displayProcessingFeeCurrency).toBe("KES")
  })
})

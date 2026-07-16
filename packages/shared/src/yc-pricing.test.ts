import { describe, expect, it } from "vitest"
import {
  buildYcFundBalanceDisplayFees,
  computeYcFundBalancePricing,
  easnerFeeLocalFromUsdCredit,
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

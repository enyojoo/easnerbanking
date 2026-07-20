import { describe, expect, it } from "vitest"
import {
  assertYcCrossBorderOmnibusSufficient,
  assertYcFundBalanceOmnibusSufficient,
  buildYcFundBalanceDisplayFees,
  checkYcCrossBorderOmnibusSufficient,
  checkYcFundBalanceOmnibusSufficient,
  computeYcBalancePayoutCappedFeeWalletSweep,
  computeYcBalancePayoutPricing,
  computeYcBalancePayoutPricingBeforeSend,
  checkYcBalancePayoutEconomicsSufficient,
  assertYcBalancePayoutEconomicsSufficient,
  computeYcCrossBorderPricing,
  computeYcCrossBorderPricingBeforeReceive,
  computeYcCrossBorderRequiredOmnibus,
  computeYcFundBalancePricing,
  computeYcFundBalancePricingBeforeReceive,
  computeYcFundBalanceAmountPreview,
  computeYcFundBalanceSendExactlyLocal,
  easnerFeeLocalFromUsdCredit,
  estimateYcFundBalanceReceiveLegFeesUsd,
  inferYcReceiveLegFeesUsd,
  buildYcReceiveLegFromResponse,
  bumpYcFundBalanceLocalPayInForOmnibusShortfall,
  bumpYcCrossBorderLocalPayInForOmnibusShortfall,
  alignYcCrossBorderLockedLocalPayIn,
  resolveYcFundBalanceSubmitLocalPayIn,
  YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC,
  YC_FUND_BALANCE_OMNIBUS_SOLVE_BUFFER_USDC,
  YC_FUND_BALANCE_OMNIBUS_TOLERANCE_USDC,
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

describe("computeYcFundBalanceAmountPreview", () => {
  it("returns principal at customer rate for USD entry (fees on review)", () => {
    const preview = computeYcFundBalanceAmountPreview({
      amountEntryMode: "usd",
      enteredAmount: 1.79,
      customerSellRate: 1396.98,
      ycSellRate: 1390,
      rail: "bank_transfer",
    })
    expect(preview).not.toBeNull()
    expect(preview!.localPayIn).toBeCloseTo(1.79 * 1396.98, 0)
    expect(preview!.estimatedTotalLocalPayIn).toBeGreaterThan(preview!.localPayIn)
    expect(preview!.feeInclusive).toBe(false)
  })

  it("pads estimated total above principal for USD entry", () => {
    const unpadded = computeYcFundBalancePricing({
      usdCredit: 2550,
      customerSellRate: 132.5,
      ycSellRate: 130,
      receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    })
    const preview = computeYcFundBalanceAmountPreview({
      amountEntryMode: "usd",
      enteredAmount: 2550,
      customerSellRate: 132.5,
      ycSellRate: 130,
      rail: "bank_transfer",
    })
    expect(preview).not.toBeNull()
    expect(preview!.localPayIn).toBeCloseTo(2550 * 132.5, 0)
    expect(preview!.estimatedTotalLocalPayIn).toBeGreaterThan(unpadded.localPayIn)
  })

  it("pads estimated total above entered local principal", () => {
    const preview = computeYcFundBalanceAmountPreview({
      amountEntryMode: "local",
      enteredAmount: 341254,
      customerSellRate: 132.5,
      ycSellRate: 130,
      rail: "bank_transfer",
    })
    expect(preview).not.toBeNull()
    expect(preview!.localPayIn).toBe(341254)
    expect(preview!.estimatedTotalLocalPayIn).toBeGreaterThan(341254)
  })
})

describe("bumpYcFundBalanceLocalPayInForOmnibusShortfall", () => {
  it("adds local pay-in for omnibus shortfall", () => {
    const bumped = bumpYcFundBalanceLocalPayInForOmnibusShortfall({
      localPayIn: 133825,
      customerSellRate: 132.5,
      requiredOmnibus: 1010,
      cryptoAmount: 986.9886349,
    })
    expect(bumped).toBeGreaterThan(133825)
  })
})

describe("computeYcFundBalancePricingBeforeReceive", () => {
  it("pads localPayIn above zero-fee preview for locked usdCredit", () => {
    const preview = computeYcFundBalancePricing({
      usdCredit: 100,
      customerSellRate: 130,
      ycSellRate: 128,
      receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    })
    const padded = computeYcFundBalancePricingBeforeReceive({
      usdCredit: 100,
      customerSellRate: 130,
      ycSellRate: 128,
    })
    expect(padded.localPayIn).toBeGreaterThan(preview.localPayIn)
    expect(padded.ycLegFeesUsd).toBeGreaterThan(0)
  })

  it("pads localPayIn entry that only covers credit + Easner fee", () => {
    const unpadded = computeYcFundBalancePricing({
      usdCredit: 1000,
      customerSellRate: 132.5,
      ycSellRate: 130,
      receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    })
    const padded = computeYcFundBalancePricingBeforeReceive({
      localPayIn: unpadded.localPayIn,
      customerSellRate: 132.5,
      ycSellRate: 130,
    })
    expect(padded.localPayIn).toBeGreaterThan(unpadded.localPayIn)
    expect(padded.usdCredit).toBe(1000)
  })

  it("adds pct-only solve buffer above fee-padded pay-in", () => {
    const padded = computeYcFundBalancePricingBeforeReceive({
      usdCredit: 1200,
      customerSellRate: 132.5,
      ycSellRate: 130,
    })
    const feeOnly = computeYcFundBalancePricing({
      usdCredit: 1200,
      customerSellRate: 132.5,
      ycSellRate: 130,
      receiveLeg: {
        cryptoAmountUsd: 0,
        networkFeeAmountUsd: padded.ycLegFeesUsd,
        serviceFeeAmountUsd: 0,
      },
    })
    const neededOmnibus = 1200 + padded.processingFee
    const expectedBufferLocal = Math.ceil(neededOmnibus * 0.005 * 132.5 * 100) / 100
    expect(padded.localPayIn).toBeGreaterThan(feeOnly.localPayIn)
    expect(padded.localPayIn - feeOnly.localPayIn).toBeCloseTo(expectedBufferLocal, 0)
  })
})

describe("inferYcReceiveLegFeesUsd", () => {
  it("infers embedded fees when YC fee fields are zero", () => {
    expect(
      inferYcReceiveLegFeesUsd({
        lockedLocalPayIn: 133825,
        customerSellRate: 132.5,
        cryptoAmountUsd: 986.9886349,
        networkFeeAmountUsd: 0,
        serviceFeeAmountUsd: 0,
      }),
    ).toBeCloseTo(23.011365, 4)
  })
})

describe("buildYcReceiveLegFromResponse", () => {
  it("uses reported service fee without double-counting when network is zero", () => {
    const leg = buildYcReceiveLegFromResponse({
      cryptoAmountUsd: 1.8250192,
      lockedLocalPayIn: 2590.01,
      customerSellRate: 1417.08,
      networkFeeAmountUsd: 0,
      serviceFeeAmountUsd: 0.02,
    })
    expect(leg.networkFeeAmountUsd).toBe(0)
    expect(leg.serviceFeeAmountUsd).toBe(0.02)
    expect(
      (leg.networkFeeAmountUsd ?? 0) + (leg.serviceFeeAmountUsd ?? 0),
    ).toBeCloseTo(0.02, 4)
  })

  it("infers embedded fees only when both reported fee fields are zero", () => {
    const leg = buildYcReceiveLegFromResponse({
      cryptoAmountUsd: 986.9886349,
      lockedLocalPayIn: 133825,
      customerSellRate: 132.5,
      networkFeeAmountUsd: 0,
      serviceFeeAmountUsd: 0,
    })
    expect(leg.networkFeeAmountUsd).toBeCloseTo(23.011365, 4)
    expect(leg.serviceFeeAmountUsd).toBe(0)
  })

  it("passes through both reported network and service fees", () => {
    const leg = buildYcReceiveLegFromResponse({
      cryptoAmountUsd: 100,
      lockedLocalPayIn: 14000,
      customerSellRate: 140,
      networkFeeAmountUsd: 0.01,
      serviceFeeAmountUsd: 0.02,
    })
    expect(leg.networkFeeAmountUsd).toBe(0.01)
    expect(leg.serviceFeeAmountUsd).toBe(0.02)
  })

  it("infers embedded receive fees using pay-in provider rate (cross-border leg1)", () => {
    const leg = buildYcReceiveLegFromResponse({
      cryptoAmountUsd: 2576,
      lockedLocalPayIn: 351500,
      customerSellRate: 130,
      networkFeeAmountUsd: 0,
      serviceFeeAmountUsd: 0,
    })
    expect(leg.networkFeeAmountUsd).toBeCloseTo(127.8462, 2)
    expect(leg.serviceFeeAmountUsd).toBe(0)
  })
})

describe("resolveYcFundBalanceSubmitLocalPayIn", () => {
  it("pads bank-scale deposits above credit + Easner fee only", () => {
    const unpadded = computeYcFundBalancePricing({
      usdCredit: 2550,
      customerSellRate: 132.5,
      ycSellRate: 130,
      receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    })
    const padded = computeYcFundBalancePricingBeforeReceive({
      usdCredit: 2550,
      customerSellRate: 132.5,
      ycSellRate: 130,
      rail: "bank_transfer",
    })
    const submitLocal = resolveYcFundBalanceSubmitLocalPayIn({
      pricing: padded,
      customerSellRate: 132.5,
    })
    expect(submitLocal).toBeGreaterThan(unpadded.localPayIn)
    expect(unpadded.localPayIn).toBeCloseTo(341253.75, 2)
    expect(submitLocal).toBeGreaterThanOrEqual(padded.localPayIn)
  })
})

describe("alignYcCrossBorderLockedLocalPayIn", () => {
  it("accepts YC locked above repriced model (submit padding)", () => {
    expect(
      alignYcCrossBorderLockedLocalPayIn({
        pricingLocalPayIn: 109057,
        ycLockedLocalPayIn: 110673,
      }),
    ).toBe(110673)
  })

  it("accepts exact match", () => {
    expect(
      alignYcCrossBorderLockedLocalPayIn({
        pricingLocalPayIn: 109057.2,
        ycLockedLocalPayIn: 109057.25,
      }),
    ).toBe(109057.25)
  })

  it("rejects underpayment vs quoted model", () => {
    expect(() =>
      alignYcCrossBorderLockedLocalPayIn({
        pricingLocalPayIn: 110673,
        ycLockedLocalPayIn: 109057,
      }),
    ).toThrow(/yc_pay_in_mismatch/)
  })
})

describe("bumpYcCrossBorderLocalPayInForOmnibusShortfall", () => {
  it("adds local pay-in when leg-1 receive crypto is short", () => {
    const bumped = bumpYcCrossBorderLocalPayInForOmnibusShortfall({
      localPayIn: 47000,
      ycSellFrom: 131.58,
      requiredOmnibus: 366.39832,
      cryptoAmount: 356.259099,
    })
    expect(bumped).toBeGreaterThan(47000)
  })
})

describe("yc omnibus sufficiency checks", () => {
  it("fund balance: requires crypto >= credit + processing fee", () => {
    expect(
      checkYcFundBalanceOmnibusSufficient({
        cryptoAmount: 101,
        usdCredit: 100,
        processingFee: 1,
      }).ok,
    ).toBe(true)
    expect(
      checkYcFundBalanceOmnibusSufficient({
        cryptoAmount: 100.5,
        usdCredit: 100,
        processingFee: 1,
      }).ok,
    ).toBe(false)
    expect(() =>
      assertYcFundBalanceOmnibusSufficient({
        cryptoAmount: 100,
        usdCredit: 100,
        processingFee: 1,
      }),
    ).toThrow(/yc_omnibus_below_required/)
  })

  it("fund balance tolerance accepts YC conversion slop on one receive call", () => {
    expect(
      checkYcFundBalanceOmnibusSufficient({
        cryptoAmount: 1211.109,
        usdCredit: 1200,
        processingFee: 12,
        tolerance: YC_FUND_BALANCE_OMNIBUS_TOLERANCE_USDC,
      }).ok,
    ).toBe(true)
  })

  it("cross-border: requires receive crypto >= send + fee + margin", () => {
    const required = computeYcCrossBorderRequiredOmnibus({
      sendCryptoUsd: 77.5,
      processingFee: 0.78,
      marginAmount: 0.5,
    })
    expect(required).toBeCloseTo(78.78, 2)
    expect(
      checkYcCrossBorderOmnibusSufficient({
        receiveCryptoUsd: 79,
        sendCryptoUsd: 77.5,
        processingFee: 0.78,
        marginAmount: 0.5,
      }).ok,
    ).toBe(true)
    expect(() =>
      assertYcCrossBorderOmnibusSufficient({
        receiveCryptoUsd: 77.5,
        sendCryptoUsd: 77.5,
        processingFee: 0.78,
        marginAmount: 0.5,
      }),
    ).toThrow(/yc_omnibus_below_required/)
  })

  it("cross-border tolerance accepts YC conversion slop on one receive call", () => {
    expect(
      checkYcCrossBorderOmnibusSufficient({
        receiveCryptoUsd: 476.029054,
        sendCryptoUsd: 470,
        processingFee: 4.7,
        marginAmount: 1.617816,
        tolerance: YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC,
      }).ok,
    ).toBe(true)
  })
})

describe("computeYcBalancePayoutPricing", () => {
  const payout2 = {
    receiveAmount: 5000,
    customerRate: 1335.6388919029,
    ycFloorUsd: 4.520121,
    ycMidUsd: 5000 / 1355.96793609,
  }

  it("totalDebited = ycFloor + margin + 1% processing fee", () => {
    const p = computeYcBalancePayoutPricing(payout2)
    expect(p.customerPrincipal).toBeCloseTo(3.743527, 4)
    expect(p.processingFee).toBeCloseTo(p.customerPrincipal * 0.01, 6)
    expect(p.totalDebited).toBeCloseTo(p.ycFloorUsd + p.marginAmount + p.processingFee, 6)
    expect(
      checkYcBalancePayoutEconomicsSufficient({
        totalDebited: p.totalDebited,
        cryptoAmount: p.ycFloorUsd,
        marginAmount: p.marginAmount,
        processingFee: p.processingFee,
      }).ok,
    ).toBe(true)
  })

  it("BeforeSend pads totalDebited above zero-fee preview", () => {
    const preview = computeYcBalancePayoutPricing({
      ...payout2,
      networkFeeAmountUsd: 0,
      serviceFeeAmountUsd: 0,
    })
    const padded = computeYcBalancePayoutPricingBeforeSend({
      receiveAmount: payout2.receiveAmount,
      customerRate: payout2.customerRate,
      provisionalCryptoUsd: payout2.ycFloorUsd,
      ycMidUsd: payout2.ycMidUsd,
      ycBuyRate: 1355.96793609,
    })
    expect(padded.totalDebited).toBeGreaterThan(preview.totalDebited)
  })

  it("caps fee wallet sweep to debit surplus", () => {
    const sweep = computeYcBalancePayoutCappedFeeWalletSweep({
      totalDebited: 4.61368,
      cryptoAuthorizedAmount: 4.520121,
      marginAmount: 0.056124,
      processingFee: 0.037435,
    })
    expect(sweep).toBeCloseTo(0.093559, 6)
    expect(sweep).toBeLessThanOrEqual(4.61368 - 4.520121 + 0.000001)
  })

  it("rejects economics when surplus is below margin + fee", () => {
    expect(
      checkYcBalancePayoutEconomicsSufficient({
        totalDebited: 4.52,
        cryptoAmount: 4.51,
        marginAmount: 0.05,
        processingFee: 0.04,
      }).ok,
    ).toBe(false)
    expect(() =>
      assertYcBalancePayoutEconomicsSufficient({
        totalDebited: 4.52,
        cryptoAmount: 4.51,
        marginAmount: 0.05,
        processingFee: 0.04,
      }),
    ).toThrow(/yc_payout_economics_invalid/)
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

import { describe, expect, it } from "vitest"
import {
  buildYcFundBalanceDepositReviewSnapshot,
  computeYcCrossBorderPrincipalLocalPayIn,
  resolveYcCrossBorderLocalPayInBreakdown,
  computeYcFundBalancePrincipalLocalPayIn,
  inferResidenceCountryFromLocalCurrency,
  isNoahVaFundingDeposit,
  normalizeYcFundBalanceDepositReview,
  reconstructYcFundBalanceDepositReview,
  resolveNoahVaFundingDepositTitle,
  resolveYcFundBalanceDepositTitle,
  resolveYcFundBalanceLocalPayInBreakdown,
  resolveYcFundBalanceNotificationActivityLabel,
} from "./yc-deposit-display"

describe("computeYcCrossBorderPrincipalLocalPayIn", () => {
  it("divides receive by pay-in rate (not multiply)", () => {
    expect(
      computeYcCrossBorderPrincipalLocalPayIn({
        receiveAmount: 3221,
        customerRate: 10.735227698797,
      }),
    ).toBe(300.04)
  })

  it("prefers provisionalPayIn from quote", () => {
    expect(
      computeYcCrossBorderPrincipalLocalPayIn({
        receiveAmount: 3221,
        customerRate: 10.74,
        provisionalPayIn: 299.5,
      }),
    ).toBe(299.5)
  })
})

describe("resolveYcCrossBorderLocalPayInBreakdown", () => {
  it("foots transfer amount + processing fee = total to pay", () => {
    const breakdown = resolveYcCrossBorderLocalPayInBreakdown({
      localPayIn: 307.94,
      payInCurrency: "KES",
      receiveAmount: 3221,
      customerRate: 10.735227698797,
      provisionalPayIn: 300.04,
      displayProcessingFeeLocal: 9.45,
    })
    expect(breakdown.principalLocal).toBe(300.04)
    expect(breakdown.feeLocal).toBe(7.9)
    expect(breakdown.totalLocal).toBe(307.94)
    expect(breakdown.principalLocal + breakdown.feeLocal).toBe(breakdown.totalLocal)
  })
})

describe("resolveYcFundBalanceDepositTitle", () => {
  it("NG bank → Nigeria Bank Deposit", () => {
    expect(
      resolveYcFundBalanceDepositTitle({
        residenceCountry: "NG",
        payInRail: "bank_transfer",
        localCurrency: "NGN",
      }),
    ).toBe("Nigeria Bank Deposit")
  })

  it("NG MOMO → Nigeria MOMO Deposit", () => {
    expect(
      resolveYcFundBalanceDepositTitle({
        residenceCountry: "NG",
        payInRail: "mobile_money",
        localCurrency: "NGN",
      }),
    ).toBe("Nigeria MOMO Deposit")
  })

  it("USD international → US Bank Deposit", () => {
    expect(
      resolveYcFundBalanceDepositTitle({
        residenceCountry: "US",
        payInRail: "bank_transfer",
        localCurrency: "USD",
      }),
    ).toBe("US Bank Deposit")
  })

  it("infers country from local currency when residence missing", () => {
    expect(
      resolveYcFundBalanceDepositTitle({
        payInRail: "bank_transfer",
        localCurrency: "NGN",
      }),
    ).toBe("Nigeria Bank Deposit")
  })
})

describe("resolveYcFundBalanceNotificationActivityLabel", () => {
  it("sentence-cases bank deposit title", () => {
    expect(
      resolveYcFundBalanceNotificationActivityLabel({
        depositDisplayTitle: "Nigeria Bank Deposit",
      }),
    ).toBe("Nigeria bank deposit")
  })

  it("preserves MOMO in activity label", () => {
    expect(
      resolveYcFundBalanceNotificationActivityLabel({
        depositDisplayTitle: "Nigeria MOMO Deposit",
      }),
    ).toBe("Nigeria MOMO deposit")
  })
})

describe("inferResidenceCountryFromLocalCurrency", () => {
  it("maps NGN to NG", () => {
    expect(inferResidenceCountryFromLocalCurrency("NGN")).toBe("NG")
  })
})

describe("Noah VA funding titles", () => {
  it("USD → US Bank Deposit", () => {
    expect(resolveNoahVaFundingDepositTitle("USD")).toBe("US Bank Deposit")
  })

  it("EUR → EU Bank Deposit", () => {
    expect(resolveNoahVaFundingDepositTitle("EUR")).toBe("EU Bank Deposit")
  })

  it("detects Noah VA funding rows", () => {
    expect(
      isNoahVaFundingDeposit({
        provider: "noah",
        direction: "in",
        metadata: { flow: "bank_onramp", fiat_deposit_currency: "USD" },
      }),
    ).toBe(true)
  })

  it("excludes YC fund_balance", () => {
    expect(
      isNoahVaFundingDeposit({
        provider: "noah",
        direction: "in",
        metadata: { flow: "bank_onramp", yc_mode: "fund_balance" },
      }),
    ).toBe(false)
  })
})

describe("deposit review snapshot", () => {
  it("builds and normalizes review snapshot", () => {
    const snapshot = buildYcFundBalanceDepositReviewSnapshot({
      localPayIn: 100000,
      localCurrency: "NGN",
      usdCredit: 65,
      processingFee: 0.65,
      exchangeFee: 0.1,
      exchangeRate: 1538.46,
      residenceCountry: "NG",
      payInRail: "bank_transfer",
    })
    expect(snapshot.transfer_method).toBe("Bank Transfer")
    expect(snapshot.credit_to).toBe("USD Balance")
    expect(snapshot.principal_local_pay_in).toBe(
      computeYcFundBalancePrincipalLocalPayIn({ usdCredit: 65, exchangeRate: 1538.46 }),
    )
    expect(normalizeYcFundBalanceDepositReview(snapshot)?.local_pay_in).toBe(100000)
  })

  it("resolveYcFundBalanceLocalPayInBreakdown foots principal + fee = total", () => {
    const snapshot = buildYcFundBalanceDepositReviewSnapshot({
      localPayIn: 13000,
      localCurrency: "KES",
      usdCredit: 100,
      processingFee: 1,
      exchangeFee: 0.5,
      exchangeRate: 128.68,
      residenceCountry: "KE",
      payInRail: "mobile_money",
      displayProcessingFeeLocal: 132,
    })
    const breakdown = resolveYcFundBalanceLocalPayInBreakdown(snapshot)
    expect(breakdown.principalLocal).toBe(12868)
    expect(breakdown.feeLocal).toBe(132)
    expect(breakdown.totalLocal).toBe(13000)
  })

  it("reconstructs legacy metadata without deposit_review", () => {
    const review = reconstructYcFundBalanceDepositReview(
      {
        local_pay_in: 50000,
        local_currency: "NGN",
        usd_credit: 32.5,
        processing_fee: 0.33,
        pay_in_rail: "mobile_money",
        residence_country: "NG",
      },
      1538,
    )
    expect(review?.transfer_method).toBe("Mobile Money")
    expect(review?.pay_in_rail).toBe("mobile_money")
  })
})

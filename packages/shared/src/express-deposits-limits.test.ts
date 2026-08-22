import { describe, expect, it } from "vitest"
import {
  EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR,
  EXPRESS_DEPOSITS_MIN_USD_CREDIT,
  expressDepositsLimits,
  nextExpressDepositsUsdCredit,
  validateExpressDepositsAmount,
} from "./express-deposits-limits"

describe("expressDepositsLimits", () => {
  it("caps EU you-pay under €1,000", () => {
    expect(expressDepositsLimits("eur")).toEqual({
      minUsdCredit: 1,
      maxYouPay: EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR,
      maxYouPayCurrency: "EUR",
    })
  })

  it("has no you-pay cap for US", () => {
    expect(expressDepositsLimits("usd").maxYouPay).toBeNull()
  })
})

describe("validateExpressDepositsAmount", () => {
  it("enforces the USD minimum", () => {
    const r = validateExpressDepositsAmount({ usdCredit: 0.5, sourceCurrency: "usd" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("min_amount_not_met")
  })

  it("blocks EU when you pay €1,000 or more", () => {
    const r = validateExpressDepositsAmount({
      usdCredit: 900,
      youPay: 1000,
      sourceCurrency: "eur",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe("max_amount_exceeded")
      expect(r.message).toContain("€999.99")
    }
  })

  it("allows EU just under €1,000", () => {
    expect(
      validateExpressDepositsAmount({
        usdCredit: 900,
        youPay: 999.99,
        sourceCurrency: "eur",
      }).ok,
    ).toBe(true)
  })

  it("blocks EU USD-you-get of €1,000+ before a quote", () => {
    const r = validateExpressDepositsAmount({ usdCredit: 1000, sourceCurrency: "eur" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("max_amount_exceeded")
  })

  it("does not apply the EUR cap to US", () => {
    expect(
      validateExpressDepositsAmount({
        usdCredit: 2500,
        youPay: 2500,
        sourceCurrency: "usd",
      }).ok,
    ).toBe(true)
  })
})

describe("nextExpressDepositsUsdCredit", () => {
  it("bumps below-min up to $1", () => {
    expect(nextExpressDepositsUsdCredit({ usdCredit: 0.4, sourceCurrency: "usd" })).toBe(
      EXPRESS_DEPOSITS_MIN_USD_CREDIT,
    )
  })

  it("clamps EU you-get when no quote yet", () => {
    expect(nextExpressDepositsUsdCredit({ usdCredit: 2500, sourceCurrency: "eur" })).toBe(
      EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR,
    )
  })

  it("scales EU you-get down from a you-pay over €1,000", () => {
    const next = nextExpressDepositsUsdCredit({
      usdCredit: 1100,
      youPay: 1200,
      sourceCurrency: "eur",
    })
    expect(next).toBe(916.65)
  })

  it("leaves a valid amount alone", () => {
    expect(
      nextExpressDepositsUsdCredit({ usdCredit: 50, youPay: 48, sourceCurrency: "eur" }),
    ).toBeNull()
  })
})

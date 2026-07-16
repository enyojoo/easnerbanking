import { describe, expect, it } from "vitest"
import {
  parseYcChannelPayInLimits,
  parseYcReceiveRejectedMinError,
  resolveYcPayInLimits,
  validateYcPayInLocalAmount,
  validateYcCrossBorderSendAmount,
  computeEnteredAmountForLocalPayInMin,
  computeCrossBorderSendEnteredAmountForMin,
  computeCrossBorderSendLocalPayIn,
  formatYcCrossBorderSendMinHint,
} from "./yc-pay-in-limits"

describe("parseYcChannelPayInLimits", () => {
  it("reads minAmount and maxAmount from channel", () => {
    expect(
      parseYcChannelPayInLimits({ minAmount: 2500, maxAmount: 1_000_000 }),
    ).toEqual({ minLocalPayIn: 2500, maxLocalPayIn: 1_000_000 })
  })

  it("treats max 0 as unlimited", () => {
    expect(parseYcChannelPayInLimits({ min: 500, max: 0 })).toEqual({
      minLocalPayIn: 500,
      maxLocalPayIn: null,
    })
  })
})

describe("resolveYcPayInLimits", () => {
  it("falls back to published NG bank minimum when channel has no limits", () => {
    expect(
      resolveYcPayInLimits({
        country: "NG",
        currency: "NGN",
        rail: "bank_transfer",
        channel: { country: "NG", currency: "NGN" },
      }),
    ).toEqual({ minLocalPayIn: 2500, maxLocalPayIn: 5_000_000 })
  })

  it("prefers channel limits over fallback", () => {
    expect(
      resolveYcPayInLimits({
        country: "NG",
        currency: "NGN",
        rail: "bank_transfer",
        channel: { minAmount: 3000, maxAmount: 5000 },
      }),
    ).toEqual({ minLocalPayIn: 3000, maxLocalPayIn: 5000 })
  })

  it("falls back to EUR corridor minimum when channel has no limits", () => {
    expect(
      resolveYcPayInLimits({
        country: "FR",
        currency: "EUR",
        rail: "bank_transfer",
        channel: { country: "FR", currency: "EUR" },
      }),
    ).toEqual({ minLocalPayIn: 10, maxLocalPayIn: null })
  })
})

describe("parseYcReceiveRejectedMinError", () => {
  it("parses YC receive rejection copy", () => {
    expect(parseYcReceiveRejectedMinError("amount must be more than 2500 NGN")).toEqual({
      minLocalPayIn: 2500,
      currency: "NGN",
    })
  })
})

describe("computeEnteredAmountForLocalPayInMin", () => {
  it("returns local minimum in local entry mode", () => {
    expect(
      computeEnteredAmountForLocalPayInMin({
        minLocalPayIn: 2500,
        amountEntryMode: "local",
        customerSellRate: 1600,
      }),
    ).toBe(2500)
  })

  it("bumps USD until preview local meets minimum", () => {
    const usd = computeEnteredAmountForLocalPayInMin({
      minLocalPayIn: 2500,
      amountEntryMode: "usd",
      customerSellRate: 1600,
    })
    expect(usd * 1600).toBeGreaterThanOrEqual(2500)
  })
})

describe("computeCrossBorderSendEnteredAmountForMin", () => {
  it("returns KES minimum in send entry mode", () => {
    expect(
      computeCrossBorderSendEnteredAmountForMin({
        minLocalPayIn: 150,
        amountEntryMode: "send",
        customerRate: 10.74,
      }),
    ).toBe(150)
  })

  it("bumps receive currency until implied KES pay-in meets minimum", () => {
    const receive = computeCrossBorderSendEnteredAmountForMin({
      minLocalPayIn: 150,
      amountEntryMode: "receive",
      customerRate: 10.74,
    })
    expect(
      computeCrossBorderSendLocalPayIn({
        amountEntryMode: "receive",
        enteredAmount: receive,
        customerRate: 10.74,
      }),
    ).toBeGreaterThanOrEqual(150)
    expect(receive).toBeGreaterThanOrEqual(150 * 10.74)
  })

  it("formats TLC min hint in receive currency", () => {
    const hint = formatYcCrossBorderSendMinHint({
      minLocalPayIn: 150,
      payInCurrency: "KES",
      receiveCurrency: "NGN",
      customerRate: 10.74,
    })
    expect(hint).toContain("KSh150")
    expect(hint).toContain("₦")
    expect(hint).not.toContain("USD")
  })
})

describe("validateYcCrossBorderSendAmount", () => {
  it("rejects receive amount below KES minimum after conversion", () => {
    const result = validateYcCrossBorderSendAmount({
      amountEntryMode: "receive",
      enteredAmount: 1000,
      customerRate: 10.74,
      payInCurrency: "KES",
      limits: { minLocalPayIn: 150, maxLocalPayIn: null },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain("Minimum transfer")
    }
  })
})

describe("validateYcPayInLocalAmount", () => {
  it("rejects below minimum", () => {
    const result = validateYcPayInLocalAmount({
      localPayIn: 1000,
      currency: "NGN",
      limits: { minLocalPayIn: 2500, maxLocalPayIn: null },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain("2,500")
      expect(result.message).toContain("Minimum deposit")
    }
  })
})

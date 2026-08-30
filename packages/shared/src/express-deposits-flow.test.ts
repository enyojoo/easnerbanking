import { describe, expect, it } from "vitest"
import { EXPRESS_DEPOSITS_COPY } from "./express-deposits-copy"
import {
  classifyExpressDepositPayError,
  coalesceExpressSavedPaymentMethods,
  expressCashKindToPaymentMethod,
  expressDepositCheckoutMandateData,
  expressDepositCollectPaymentOpts,
  expressDepositPayNeedsCollect,
  expressInstrumentFromCollectDetails,
  expressPaymentMethodDisplayForMethod,
  expressPaymentMethodDisplayFromReview,
  expressReviewDepositMethodLabel,
  expressSavedInstrumentForMethod,
  formatExpressSavedInstrumentLabel,
  mergeExpressSavedPaymentMethods,
  nextExpressDepositStep,
  parseExpressDepositFlowParams,
  parseExpressDepositsPricing,
  parseExpressSavedPaymentMethods,
} from "./express-deposits-flow"
import type { ExpressDepositsPricingBreakdown } from "./express-deposits-pricing"

const pricing: ExpressDepositsPricingBreakdown = {
  usdCredit: 40,
  sourceCurrency: "USD",
  stripeSourceTotal: 41.2,
  stripeFees: { transaction: 1.2, network: 0, total: 1.2 },
  easnerProcessingFeeUsd: 0,
  easnerProcessingFeeDisplay: 0,
  displayProcessingFee: 1.2,
  totalToPay: 41.2,
  rateFetchedAt: 1_700_000_000,
}

const cardInstrument = {
  paymentTokenId: "tok_card",
  last4: "4242",
  brand: "visa",
}

const achInstrument = {
  paymentTokenId: "tok_bank",
  last4: "6789",
  bankName: "Chase",
}

describe("expressCashKindToPaymentMethod", () => {
  it("maps all four add-money kinds", () => {
    expect(expressCashKindToPaymentMethod("express_card")).toBe("card")
    expect(expressCashKindToPaymentMethod("express_apple_pay")).toBe("apple_pay")
    expect(expressCashKindToPaymentMethod("express_google_pay")).toBe("google_pay")
    expect(expressCashKindToPaymentMethod("express_ach")).toBe("ach")
  })
})

describe("nextExpressDepositStep", () => {
  it("sends card and ACH to setup when that rail has no token", () => {
    expect(nextExpressDepositStep({ method: "express_card" })).toBe("setup")
    expect(nextExpressDepositStep({ method: "express_ach" })).toBe("setup")
    expect(
      nextExpressDepositStep({
        method: "express_ach",
        paymentMethods: { card: cardInstrument },
      }),
    ).toBe("setup")
    expect(
      nextExpressDepositStep({
        method: "express_card",
        paymentMethods: { ach: achInstrument },
      }),
    ).toBe("setup")
  })

  it("does not skip either rail for a legacy untyped token", () => {
    expect(
      nextExpressDepositStep({
        method: "express_card",
        paymentMethods: {},
      }),
    ).toBe("setup")
    expect(nextExpressDepositStep({ method: "express_ach" })).toBe("setup")
  })

  it("skips setup only when the matching rail is saved", () => {
    expect(
      nextExpressDepositStep({
        method: "express_card",
        paymentMethods: { card: cardInstrument, ach: achInstrument },
      }),
    ).toBe("review")
    expect(
      nextExpressDepositStep({
        method: "express_ach",
        paymentMethods: { card: cardInstrument, ach: achInstrument },
      }),
    ).toBe("review")
  })

  it("never skips setup when forceCollect is set", () => {
    expect(
      nextExpressDepositStep({
        method: "express_card",
        paymentMethods: { card: cardInstrument },
        forceCollect: true,
      }),
    ).toBe("setup")
  })

  it("sends Apple Pay and Google Pay to review even when a card token exists", () => {
    expect(
      nextExpressDepositStep({
        method: "express_apple_pay",
        paymentMethods: { card: cardInstrument },
      }),
    ).toBe("review")
    expect(
      nextExpressDepositStep({
        method: "express_google_pay",
        paymentMethods: { card: cardInstrument },
      }),
    ).toBe("review")
    expect(nextExpressDepositStep({ method: "express_apple_pay" })).toBe("review")
  })
})

describe("expressDepositPayNeedsCollect", () => {
  it("always collects Apple Pay and Google Pay, even with a saved card token", () => {
    expect(
      expressDepositPayNeedsCollect({
        method: "express_apple_pay",
        paymentMethods: { card: cardInstrument },
      }),
    ).toBe(true)
    expect(
      expressDepositPayNeedsCollect({
        method: "express_google_pay",
        paymentMethods: { card: cardInstrument },
      }),
    ).toBe(true)
  })

  it("collects card and ACH only when that rail is missing", () => {
    expect(expressDepositPayNeedsCollect({ method: "express_card" })).toBe(true)
    expect(
      expressDepositPayNeedsCollect({
        method: "express_card",
        paymentMethods: { card: cardInstrument },
      }),
    ).toBe(false)
    expect(
      expressDepositPayNeedsCollect({
        method: "express_card",
        paymentTokenId: "tok_card",
      }),
    ).toBe(false)
    expect(
      expressDepositPayNeedsCollect({
        method: "express_ach",
        paymentMethods: { card: cardInstrument },
      }),
    ).toBe(true)
    expect(
      expressDepositPayNeedsCollect({
        method: "express_ach",
        paymentMethods: { ach: achInstrument },
      }),
    ).toBe(false)
  })
})

describe("formatExpressSavedInstrumentLabel", () => {
  it("shows brand and last4 for cards, and bank name and last4 for ACH", () => {
    expect(
      formatExpressSavedInstrumentLabel({ rail: "card", brand: "visa", last4: "4242" }),
    ).toBe("Visa ····4242")
    expect(
      formatExpressSavedInstrumentLabel({ rail: "ach", bankName: "Chase", last4: "6789" }),
    ).toBe("Chase ····6789")
  })

  it("falls back when last4 is missing", () => {
    expect(formatExpressSavedInstrumentLabel({ rail: "card" })).toBe(EXPRESS_DEPOSITS_COPY.cardTitle)
    expect(formatExpressSavedInstrumentLabel({ rail: "ach" })).toBe("US bank")
    expect(formatExpressSavedInstrumentLabel({ rail: "card", last4: "4242" })).toBe("Card ····4242")
    expect(formatExpressSavedInstrumentLabel({ rail: "ach", last4: "6789" })).toBe("US bank ····6789")
  })
})

describe("expressReviewDepositMethodLabel", () => {
  it("uses the saved instrument on review and wallet titles otherwise", () => {
    expect(
      expressReviewDepositMethodLabel({
        method: "express_card",
        paymentMethods: { card: cardInstrument },
      }),
    ).toBe("Visa ····4242")
    expect(
      expressReviewDepositMethodLabel({
        method: "express_ach",
        paymentMethods: { ach: achInstrument },
      }),
    ).toBe("Chase ····6789")
    expect(expressReviewDepositMethodLabel({ method: "express_card" })).toBe("Card")
    expect(expressReviewDepositMethodLabel({ method: "express_apple_pay" })).toBe("Apple Pay")
  })
})

describe("expressPaymentMethodDisplay", () => {
  it("maps card brand to icon key and last4 mask beside chip", () => {
    expect(
      expressPaymentMethodDisplayForMethod({
        method: "express_card",
        paymentMethods: { card: cardInstrument },
      }),
    ).toEqual({
      iconKey: "visa",
      text: "•••• 4242",
      accessibilityLabel: "Visa ····4242",
    })
  })

  it("rehydrates display from persisted deposit review fields", () => {
    expect(
      expressPaymentMethodDisplayFromReview({
        paymentMethod: "card",
        brand: "visa",
        last4: "9082",
      }),
    ).toEqual({
      iconKey: "visa",
      text: "•••• 9082",
      accessibilityLabel: "Visa ····9082",
    })
  })

  it("uses Apple and Google brand marks for wallet express deposits", () => {
    expect(
      expressPaymentMethodDisplayForMethod({ method: "express_apple_pay" }),
    ).toEqual({
      iconKey: "apple",
      text: "Apple Pay",
      accessibilityLabel: "Apple Pay",
    })
    expect(
      expressPaymentMethodDisplayForMethod({ method: "express_google_pay" }),
    ).toEqual({
      iconKey: "google",
      text: "Google Pay",
      accessibilityLabel: "Google Pay",
    })
    expect(
      expressPaymentMethodDisplayFromReview({ paymentMethod: "apple_pay" }),
    ).toMatchObject({ iconKey: "apple" })
    expect(
      expressPaymentMethodDisplayFromReview({ paymentMethod: "google_pay" }),
    ).toMatchObject({ iconKey: "google" })
  })
})

describe("parseExpressSavedPaymentMethods", () => {
  it("keeps card and ACH independent and ignores untyped tokens", () => {
    const parsed = parseExpressSavedPaymentMethods({
      card: cardInstrument,
      ach: { last4: "1111" },
    })
    expect(expressSavedInstrumentForMethod(parsed, "express_card")?.paymentTokenId).toBe("tok_card")
    expect(expressSavedInstrumentForMethod(parsed, "express_ach")).toBeNull()
    expect(
      mergeExpressSavedPaymentMethods(parsed, "ach", achInstrument).ach?.paymentTokenId,
    ).toBe("tok_bank")
    expect(
      coalesceExpressSavedPaymentMethods({ card: cardInstrument }, { ach: achInstrument }).ach
        ?.bankName,
    ).toBe("Chase")
  })

  it("reads last4 and brand from collect details", () => {
    expect(
      expressInstrumentFromCollectDetails({
        card: { last4: "4242", brand: "mastercard" },
      }),
    ).toEqual({ last4: "4242", brand: "mastercard", bankName: null })
    expect(
      expressInstrumentFromCollectDetails({
        us_bank_account: { last4: "6789", bank_name: "Chase" },
      }),
    ).toEqual({ last4: "6789", brand: null, bankName: "Chase" })
  })
})

describe("expressDepositCollectPaymentOpts", () => {
  it("passes amount and currency for wallets only", () => {
    const wallet = expressDepositCollectPaymentOpts({
      method: "express_apple_pay",
      amount: 41.2,
      currency: "usd",
    })
    expect(wallet.amount).toBe(41.2)
    expect(wallet.currency).toBe("USD")
    expect((wallet.wallets as { applePay?: string }).applePay).toBe("auto")

    const card = expressDepositCollectPaymentOpts({
      method: "express_card",
      amount: 41.2,
      currency: "USD",
    })
    expect(card.amount).toBeUndefined()
    expect(card.payment_method_types).toEqual(["card"])
    expect(expressDepositCollectPaymentOpts({ method: "express_ach" }).payment_method_types).toEqual(
      ["us_bank_account"],
    )
  })
})

describe("expressDepositCheckoutMandateData", () => {
  it("sends ACH customer acceptance only", () => {
    expect(expressDepositCheckoutMandateData("express_ach")).toEqual({
      customer_acceptance: { type: "online" },
    })
    expect(expressDepositCheckoutMandateData("express_card")).toBeUndefined()
  })
})

describe("parseExpressDepositsPricing", () => {
  it("accepts API pricing and rejects raw stripe totals", () => {
    expect(parseExpressDepositsPricing(pricing)?.totalToPay).toBe(41.2)
    expect(parseExpressDepositsPricing({ source_total_amount: "41.2" })).toBeNull()
    expect(parseExpressDepositsPricing({ usdCredit: 40, totalToPay: 0, sourceCurrency: "USD" })).toBeNull()
  })
})

describe("parseExpressDepositFlowParams", () => {
  it("requires method, usdCredit, and pricing", () => {
    expect(parseExpressDepositFlowParams({ method: "express_card" })).toBeNull()
    expect(
      parseExpressDepositFlowParams({
        method: "express_card",
        usdCredit: 40,
        pricing,
        paymentTokenId: "tok",
      })?.paymentTokenId,
    ).toBeUndefined()
    expect(
      parseExpressDepositFlowParams({
        method: "express_card",
        usdCredit: 40,
        pricing,
        paymentMethods: { card: cardInstrument },
      })?.paymentTokenId,
    ).toBe("tok_card")
  })
})

describe("classifyExpressDepositPayError", () => {
  it("routes identity gaps to KYC and token mismatches to setup", () => {
    expect(classifyExpressDepositPayError("missing_document")).toBe("kyc")
    expect(classifyExpressDepositPayError("payment_method_invalid")).toBe("wrong_token")
    expect(classifyExpressDepositPayError(null, "invalid_token for us_bank_account")).toBe("failed")
    expect(classifyExpressDepositPayError("crypto_onramp_invalid_payment_token")).toBe("wrong_token")
    expect(classifyExpressDepositPayError("card_declined", "Payment could not be completed")).toBe(
      "failed",
    )
    expect(
      classifyExpressDepositPayError(
        "card_declined",
        "Your payment method could not be charged for this purchase",
      ),
    ).toBe("failed")
  })
})

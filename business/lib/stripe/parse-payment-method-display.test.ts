import { describe, expect, it } from "vitest"
import type Stripe from "stripe"
import {
  parsePaymentMethodDisplayFromCharge,
  paymentMethodDisplayFromMetadata,
} from "./parse-payment-method-display"
import {
  formatPaymentMethodText,
  paymentMethodIconKey,
} from "./payment-method-display"

function chargeWith(
  details: Stripe.Charge.PaymentMethodDetails,
): Stripe.Charge {
  return { payment_method_details: details } as Stripe.Charge
}

describe("parsePaymentMethodDisplayFromCharge", () => {
  it("parses card brand, last4, and wallet", () => {
    const pm = parsePaymentMethodDisplayFromCharge(
      chargeWith({
        type: "card",
        card: {
          brand: "visa",
          last4: "4242",
          wallet: { type: "apple_pay" },
        } as Stripe.Charge.PaymentMethodDetails.Card,
      }),
    )
    expect(pm).toEqual({
      type: "card",
      brand: "visa",
      last4: "4242",
      wallet: "apple_pay",
    })
  })

  it("parses us_bank_account", () => {
    const pm = parsePaymentMethodDisplayFromCharge(
      chargeWith({
        type: "us_bank_account",
        us_bank_account: {
          last4: "6789",
          bank_name: "STRIPE TEST BANK",
        } as Stripe.Charge.PaymentMethodDetails.UsBankAccount,
      }),
    )
    expect(pm).toEqual({
      type: "us_bank_account",
      last4: "6789",
      bankName: "STRIPE TEST BANK",
    })
  })

  it("parses link type", () => {
    const pm = parsePaymentMethodDisplayFromCharge(
      chargeWith({
        type: "link",
        link: {} as Stripe.Charge.PaymentMethodDetails.Link,
      }),
    )
    expect(pm).toEqual({ type: "link" })
  })

  it("parses klarna type", () => {
    const pm = parsePaymentMethodDisplayFromCharge(
      chargeWith({
        type: "klarna",
        klarna: {} as Stripe.Charge.PaymentMethodDetails.Klarna,
      }),
    )
    expect(pm).toEqual({ type: "klarna" })
  })
})

describe("paymentMethodDisplayFromMetadata", () => {
  it("prefers payment_method object over legacy type", () => {
    expect(
      paymentMethodDisplayFromMetadata({
        payment_method_type: "card",
        payment_method: { type: "card", brand: "mastercard", last4: "4444" },
      }),
    ).toEqual({
      type: "card",
      brand: "mastercard",
      last4: "4444",
      wallet: null,
      bankName: undefined,
    })
  })

  it("falls back to payment_method_type", () => {
    expect(paymentMethodDisplayFromMetadata({ payment_method_type: "link" })).toEqual({
      type: "link",
    })
  })
})

describe("formatPaymentMethodText / icon key", () => {
  it("formats visa with mask", () => {
    expect(
      formatPaymentMethodText({ type: "card", brand: "visa", last4: "4242" }),
    ).toBe("Visa •••• 4242")
    expect(paymentMethodIconKey({ type: "card", brand: "visa", last4: "4242" })).toBe(
      "visa",
    )
  })

  it("formats bank and falls back to card icon", () => {
    expect(
      formatPaymentMethodText({
        type: "us_bank_account",
        last4: "6789",
        bankName: "Chase",
      }),
    ).toBe("Chase •••• 6789")
    expect(paymentMethodIconKey({ type: "us_bank_account", last4: "6789" })).toBe("bank")
    expect(paymentMethodIconKey({ type: "card" })).toBe("card")
  })

  it("formats apple pay wallet", () => {
    expect(
      formatPaymentMethodText({
        type: "card",
        brand: "visa",
        last4: "4242",
        wallet: "apple_pay",
      }),
    ).toBe("Apple Pay · Visa •••• 4242")
  })
})

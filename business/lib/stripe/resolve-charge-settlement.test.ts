import { describe, expect, it } from "vitest"
import type Stripe from "stripe"
import { payerIdentityFromPaymentIntent } from "./resolve-charge-settlement"

describe("payerIdentityFromPaymentIntent", () => {
  it("reads email from the charge when receipt_email is empty", () => {
    const pi = {
      receipt_email: null,
      latest_charge: {
        billing_details: { email: "card@example.com", name: "Ada" },
      },
      payment_method: null,
    } as unknown as Stripe.PaymentIntent

    expect(payerIdentityFromPaymentIntent(pi)).toEqual({
      payerEmail: "card@example.com",
      payerName: "Ada",
    })
  })

  it("prefers receipt_email when Stripe set it", () => {
    const pi = {
      receipt_email: "receipt@example.com",
      latest_charge: {
        billing_details: { email: "card@example.com" },
      },
    } as unknown as Stripe.PaymentIntent

    expect(payerIdentityFromPaymentIntent(pi).payerEmail).toBe("receipt@example.com")
  })
})

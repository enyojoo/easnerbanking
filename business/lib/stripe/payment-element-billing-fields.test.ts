import { describe, expect, it } from "vitest"
import { paymentElementBillingFields } from "./payment-element-billing-fields"

describe("paymentElementBillingFields", () => {
  it("keeps email: never on the card accordion for payment links", () => {
    expect(paymentElementBillingFields({ collectEmail: true })).toEqual({
      billingDetails: { name: "always", email: "never" },
      card: { billingDetails: { name: "always", email: "never" } },
    })
  })

  it("keeps email: never on card when the invoice already has a bill-to address", () => {
    expect(paymentElementBillingFields({ knownEmail: "ada@example.com" })).toEqual({
      billingDetails: { name: "always", email: "never" },
      card: { billingDetails: { name: "always", email: "never" } },
    })
  })

  it("does not hide Stripe email when we are not collecting it ourselves", () => {
    expect(paymentElementBillingFields({})).toEqual({
      billingDetails: { name: "always" },
      card: { billingDetails: { name: "always" } },
    })
  })
})

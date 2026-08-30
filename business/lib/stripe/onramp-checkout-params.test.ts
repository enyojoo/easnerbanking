import { describe, expect, it } from "vitest"
import {
  buildStripeOnrampCheckoutParams,
  withStripeOnrampClientContext,
} from "./onramp-checkout-params"

function requestWith(headers: Record<string, string>): Request {
  return new Request("https://api.easner.com/api/stripe/onramp/sessions", { headers })
}

describe("onramp client context", () => {
  it("merges customer_ip_address into session create params", () => {
    const params = withStripeOnrampClientContext(
      requestWith({}),
      { customerIpAddress: "203.0.113.10" },
      {
        crypto_customer_id: "crc_123",
        destination_amount: "1",
      },
    )
    expect(params).toMatchObject({
      crypto_customer_id: "crc_123",
      destination_amount: "1",
      customer_ip_address: "203.0.113.10",
    })
    expect(params).not.toHaveProperty("user_agent")
  })

  it("returns customer_ip_required when IP is unavailable in production", () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    const params = withStripeOnrampClientContext(
      new Request("https://api.easner.com/api/stripe/onramp/sessions"),
      {},
      { crypto_customer_id: "crc_123" },
    )
    expect(params).toEqual({
      error: "Could not determine client IP for payment.",
      code: "customer_ip_required",
    })
    process.env.NODE_ENV = prev
  })

  it("builds empty checkout params for card when token is on the session", () => {
    expect(
      buildStripeOnrampCheckoutParams({
        customerIpAddress: "203.0.113.10",
        paymentTokenId: "cpt_123",
        userAgent: "EasnerMobile/1.0",
      }),
    ).toEqual({})
  })

  it("passes mandate_data for ACH checkout", () => {
    expect(
      buildStripeOnrampCheckoutParams({
        mandateData: { customer_acceptance: { type: "online" } },
      }),
    ).toEqual({
      mandate_data: { customer_acceptance: { type: "online" } },
    })
  })
})

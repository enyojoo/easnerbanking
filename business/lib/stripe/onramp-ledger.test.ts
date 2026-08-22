import { describe, expect, it } from "vitest"
import { buildStripeOnrampCreditKey } from "./onramp-credit-key"

describe("buildStripeOnrampCreditKey", () => {
  it("namespaces session ids", () => {
    expect(buildStripeOnrampCreditKey("cos_123")).toBe("stripe_onramp:cos_123")
  })
})

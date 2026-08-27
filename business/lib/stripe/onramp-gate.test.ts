import { describe, expect, it, vi } from "vitest"
import { stripeOnrampOfficeFlags } from "./onramp-gate"

vi.mock("./onramp-config", () => ({
  isStripeOnrampEnabled: () => true,
  isStripeOnrampEuEnabled: () => true,
}))

describe("stripeOnrampOfficeFlags", () => {
  it("stays on when the US corridor allows Express", () => {
    expect(stripeOnrampOfficeFlags({ usPayInAllowsExpress: true })).toEqual({
      stripeOnrampEnabled: true,
      stripeOnrampEuEnabled: true,
    })
  })

  it("turns Express off on VA only even if env is on", () => {
    expect(stripeOnrampOfficeFlags({ usPayInAllowsExpress: false })).toEqual({
      stripeOnrampEnabled: false,
      stripeOnrampEuEnabled: false,
    })
  })

  it("defaults to env-only when corridor mode is omitted", () => {
    expect(stripeOnrampOfficeFlags()).toEqual({
      stripeOnrampEnabled: true,
      stripeOnrampEuEnabled: true,
    })
  })
})

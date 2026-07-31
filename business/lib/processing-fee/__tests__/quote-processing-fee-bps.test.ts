import { describe, expect, it } from "vitest"
import { recipientPayoutRail } from "@/lib/processing-fee/quote-processing-fee-bps"

describe("recipientPayoutRail", () => {
  it("returns mobile_money when mobile_provider is set", () => {
    expect(recipientPayoutRail({ mobile_provider: "MTN", bank_name: "GTBank" })).toBe("mobile_money")
  })

  it("returns bank_transfer for standard bank recipients", () => {
    expect(recipientPayoutRail({ bank_name: "GTBank" })).toBe("bank_transfer")
  })
})

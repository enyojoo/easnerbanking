import { describe, expect, it } from "vitest"
import { projectCorridorForSurface } from "@easner/shared"

describe("send-destinations catalog projection", () => {
  it("builds different routing and ETag material by role", () => {
    const row = {
      provider_routing: [{ provider: "noah", priority: 1, settlement_asset: "USDC" }],
      metadata: {
        noah_send_enabled: true,
        surfaces: {
          business: { payout: "noah", pay_in: "noah", cross_border: null },
          personal: { payout: "grid", pay_in: "grid", cross_border: null },
        },
      },
    }
    const business = projectCorridorForSurface(row, "business")
    const personal = projectCorridorForSurface(row, "personal")
    expect(business.provider_routing[0]?.provider).toBe("noah")
    expect(personal.provider_routing[0]?.provider).toBe("grid")
    const businessVersion = `business:${JSON.stringify(business.provider_routing)}`
    const personalVersion = `personal:${JSON.stringify(personal.provider_routing)}`
    expect(businessVersion).not.toBe(personalVersion)
  })
})

import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/stripe/onramp-config", () => ({
  isStripeOnrampEnabled: () => true,
  isStripeOnrampEuEnabled: () => true,
}))

import {
  actorExpressDepositsEligible,
  actorNgLocalEligible,
  canUseGeoPersonalRails,
} from "./geo-personal-rail-access"

describe("canUseGeoPersonalRails", () => {
  it("allows Owner and Admin", () => {
    expect(canUseGeoPersonalRails("Owner")).toBe(true)
    expect(canUseGeoPersonalRails("Admin")).toBe(true)
  })

  it("denies Member and Viewer", () => {
    expect(canUseGeoPersonalRails("Member")).toBe(false)
    expect(canUseGeoPersonalRails("Viewer")).toBe(false)
  })
})

describe("actorNgLocalEligible", () => {
  it("is true only for NG residence", () => {
    expect(actorNgLocalEligible({ id: "u1", residence_country: "NG" })).toBe(true)
    expect(actorNgLocalEligible({ id: "u1", residence_country: "US" })).toBe(false)
  })
})

describe("actorExpressDepositsEligible", () => {
  it("uses actor residence not org owner", () => {
    expect(
      actorExpressDepositsEligible({
        id: "admin-1",
        residence_country: "US",
        kyc_address_country: "US",
        kyc_address_state: "CA",
      }),
    ).toBe(true)
    expect(
      actorExpressDepositsEligible({
        id: "admin-1",
        residence_country: "NG",
      }),
    ).toBe(false)
  })
})

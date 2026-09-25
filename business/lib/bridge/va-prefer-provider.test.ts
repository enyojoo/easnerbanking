import { describe, expect, it } from "vitest"
import {
  preferBusinessUsdVirtualAccountProvider,
  preferConsumerVirtualAccountProvider,
} from "./va-prefer-provider"

describe("preferConsumerVirtualAccountProvider", () => {
  it("keeps New York on Noah", () => {
    expect(preferConsumerVirtualAccountProvider({ countryCode: "US", state: "NY" })).toBe("noah")
  })

  it("uses Bridge for other onboardable residences", () => {
    expect(preferConsumerVirtualAccountProvider({ countryCode: "US", state: "CA" })).toBe("bridge")
    expect(preferConsumerVirtualAccountProvider({ countryCode: "DE" })).toBe("bridge")
  })
})

describe("preferBusinessUsdVirtualAccountProvider", () => {
  it("keeps Office Bridge routing on Bridge", () => {
    expect(
      preferBusinessUsdVirtualAccountProvider({
        officePayIn: "bridge",
        gridApproved: true,
        bridgeApproved: false,
      }),
    ).toBe("bridge")
  })

  it("prefers Grid when Global banking is approved under default Grid routing", () => {
    expect(
      preferBusinessUsdVirtualAccountProvider({
        officePayIn: "grid",
        gridApproved: true,
        bridgeApproved: true,
      }),
    ).toBe("grid")
  })

  it("falls back to Bridge USD when only Bridge KYB is approved", () => {
    expect(
      preferBusinessUsdVirtualAccountProvider({
        officePayIn: "grid",
        gridApproved: false,
        bridgeApproved: true,
      }),
    ).toBe("bridge")
  })

  it("defaults to Grid when neither rail is approved", () => {
    expect(
      preferBusinessUsdVirtualAccountProvider({
        officePayIn: null,
        gridApproved: false,
        bridgeApproved: false,
      }),
    ).toBe("grid")
  })
})

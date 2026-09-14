import { describe, expect, it } from "vitest"
import { preferConsumerVirtualAccountProvider } from "./va-prefer-provider"

describe("preferConsumerVirtualAccountProvider", () => {
  it("keeps New York on Noah", () => {
    expect(preferConsumerVirtualAccountProvider({ countryCode: "US", state: "NY" })).toBe("noah")
  })

  it("uses Bridge for other onboardable residences", () => {
    expect(preferConsumerVirtualAccountProvider({ countryCode: "US", state: "CA" })).toBe("bridge")
    expect(preferConsumerVirtualAccountProvider({ countryCode: "DE" })).toBe("bridge")
  })
})

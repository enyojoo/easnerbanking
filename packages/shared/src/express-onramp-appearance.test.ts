import { describe, expect, it } from "vitest"
import { expressOnrampLinkConfigure } from "./express-onramp-appearance"

describe("expressOnrampLinkConfigure", () => {
  it("omits cryptoCustomerId when not provided", () => {
    const config = expressOnrampLinkConfigure()
    expect(config).not.toHaveProperty("cryptoCustomerId")
    expect(config.merchantDisplayName).toBe("Easner")
  })

  it("includes cryptoCustomerId when provided", () => {
    const config = expressOnrampLinkConfigure("ccus_123")
    expect(config.cryptoCustomerId).toBe("ccus_123")
  })
})

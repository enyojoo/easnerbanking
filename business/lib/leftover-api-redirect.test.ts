import { afterEach, describe, expect, it, vi } from "vitest"
import { leftoverApiRedirectUrl } from "./leftover-api-redirect"

describe("leftoverApiRedirectUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("points leftover /api paths at the API origin", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.easner.com")
    const dest = leftoverApiRedirectUrl(
      "https://business.easner.com/api/business/profile?x=1",
      ["business", "profile"],
    )
    expect(dest?.href).toBe("https://api.easner.com/api/business/profile?x=1")
  })

  it("returns null when the API origin is this host", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://business.easner.com")
    expect(
      leftoverApiRedirectUrl("https://business.easner.com/api/health", ["health"]),
    ).toBeNull()
  })
})

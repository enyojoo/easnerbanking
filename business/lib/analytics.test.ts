import { beforeEach, describe, expect, it, vi } from "vitest"

const capture = vi.fn()
const identify = vi.fn()
const reset = vi.fn()
const register = vi.fn()

vi.mock("@/lib/posthog", () => ({
  getPostHog: () => ({ capture, identify, reset, register }),
}))

describe("analytics conversion events", () => {
  beforeEach(() => {
    capture.mockClear()
    identify.mockClear()
    reset.mockClear()
    register.mockClear()
  })

  it("emits signup_page_viewed", async () => {
    const { analytics } = await import("@/lib/analytics")
    analytics.trackSignupPageViewed()
    expect(capture).toHaveBeenCalledWith(
      "signup_page_viewed",
      expect.objectContaining({ platform: "business_web" }),
    )
  })

  it("emits signup_completed alongside user_signed_up", async () => {
    const { analytics } = await import("@/lib/analytics")
    analytics.trackSignUp("google", { userId: "u1" })
    expect(capture).toHaveBeenCalledWith(
      "user_signed_up",
      expect.objectContaining({ method: "google", userId: "u1" }),
    )
    expect(capture).toHaveBeenCalledWith(
      "signup_completed",
      expect.objectContaining({ method: "google", userId: "u1" }),
    )
  })

  it("emits login_completed alongside user_signed_in", async () => {
    const { analytics } = await import("@/lib/analytics")
    analytics.trackSignIn("email", { userId: "u1" })
    expect(capture).toHaveBeenCalledWith(
      "user_signed_in",
      expect.objectContaining({ method: "email", userId: "u1" }),
    )
    expect(capture).toHaveBeenCalledWith(
      "login_completed",
      expect.objectContaining({ method: "email", userId: "u1" }),
    )
  })

  it("tags payer events with payer_web and host", async () => {
    vi.stubGlobal("window", { location: { hostname: "pay.easner.com" } })
    const { analytics } = await import("@/lib/analytics")
    analytics.trackPayerLinkViewed({ path: "acme/invoice" })
    expect(capture).toHaveBeenCalledWith(
      "payer_link_viewed",
      expect.objectContaining({
        platform: "payer_web",
        surface: "payer",
        host: "pay.easner.com",
        path: "acme/invoice",
      }),
    )
    vi.unstubAllGlobals()
  })

  it("registers payer web super properties", async () => {
    vi.stubGlobal("window", { location: { hostname: "invoice.easner.com" } })
    const { analytics } = await import("@/lib/analytics")
    analytics.registerPayerWebContext()
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "payer_web",
        surface: "payer",
        host: "invoice.easner.com",
      }),
    )
    vi.unstubAllGlobals()
  })
})

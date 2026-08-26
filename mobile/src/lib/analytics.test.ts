import { beforeEach, describe, expect, it, vi } from "vitest"
import { ANALYTICS_PLATFORM, consumerPlatformFromOs } from "@easner/shared"

describe("consumerPlatformFromOs", () => {
  it("maps ios to consumer_ios", () => {
    expect(consumerPlatformFromOs("ios")).toBe(ANALYTICS_PLATFORM.consumerIos)
  })

  it("maps android to consumer_android", () => {
    expect(consumerPlatformFromOs("android")).toBe(ANALYTICS_PLATFORM.consumerAndroid)
  })

  it("maps web and unknown OS to consumer_web", () => {
    expect(consumerPlatformFromOs("web")).toBe(ANALYTICS_PLATFORM.consumerWeb)
    expect(consumerPlatformFromOs("windows")).toBe(ANALYTICS_PLATFORM.consumerWeb)
  })
})

describe("mobile analytics wrapper", () => {
  const capture = vi.fn()

  beforeEach(() => {
    capture.mockClear()
    vi.resetModules()
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
  })

  it("tags events with consumer_ios and os when Platform.OS is ios", async () => {
    vi.doMock("react-native", () => ({ Platform: { OS: "ios" } }))
    vi.doMock("./posthog", () => ({ getPostHog: () => ({ capture }) }))
    const { analytics } = await import("./analytics")
    analytics.trackSendStarted({ sendCurrency: "USD", receiveCurrency: "NGN" })
    expect(capture).toHaveBeenCalledWith(
      "send_started",
      expect.objectContaining({
        platform: ANALYTICS_PLATFORM.consumerIos,
        os: "ios",
        sendCurrency: "USD",
        receiveCurrency: "NGN",
      }),
    )
  })

  it("tags events with consumer_web when Platform.OS is web", async () => {
    vi.doMock("react-native", () => ({ Platform: { OS: "web" } }))
    vi.doMock("./posthog", () => ({ getPostHog: () => ({ capture }) }))
    const { analytics } = await import("./analytics")
    analytics.trackReceiveViewed({ currency: "USD" })
    expect(capture).toHaveBeenCalledWith(
      "receive_viewed",
      expect.objectContaining({
        platform: ANALYTICS_PLATFORM.consumerWeb,
        os: "web",
      }),
    )
  })
})

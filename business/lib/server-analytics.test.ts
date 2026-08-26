import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fetchMock = vi.fn().mockResolvedValue({ ok: true })

describe("server analytics", () => {
  beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal("fetch", fetchMock)
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST
  })

  it("fires checkout_started with company group", async () => {
    const { trackServerCheckoutStarted } = await import("@/lib/server-analytics")
    trackServerCheckoutStarted({
      channel: "embed",
      businessId: "biz_1",
      settlementId: "set_1",
      currency: "USD",
      amountCents: 5000,
      livemode: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.event).toBe("checkout_started")
    expect(body.distinct_id).toBe("business:biz_1")
    expect(body.properties.channel).toBe("embed")
    expect(body.properties.$groups).toEqual({ company: "biz_1" })
    expect(body.properties.$insert_id).toBe("checkout_started:set_1")
  })

  it("only emits embed payer success server-side", async () => {
    const { trackServerEmbedPayerPaymentSucceeded } = await import("@/lib/server-analytics")
    trackServerEmbedPayerPaymentSucceeded({
      channel: "payment_link",
      businessId: "biz_1",
      settlementId: "set_1",
      currency: "USD",
      amountCents: 5000,
    })
    expect(fetchMock).not.toHaveBeenCalled()

    trackServerEmbedPayerPaymentSucceeded({
      channel: "embed",
      businessId: "biz_1",
      settlementId: "set_1",
      currency: "USD",
      amountCents: 5000,
      stripeEventId: "evt_1",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.event).toBe("payer_payment_succeeded")
    expect(body.properties.platform).toBe("payer_web")
  })
})

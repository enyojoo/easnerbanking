import { describe, expect, it } from "vitest"
import { signMerchantWebhookPayload, verifyMerchantWebhookPayload } from "./secrets"
import { checkoutCompletedWebhookData } from "./merchant-webhook-payload"
import { normalizeSubscribedWebhookEvents } from "./merchant-webhook-events"

describe("merchant webhook signatures", () => {
  it("verifies a signed payload", () => {
    const body = JSON.stringify({ type: "checkout.completed", data: { amount_cents: 4900 } })
    const timestampSeconds = 1_700_000_000
    const header = signMerchantWebhookPayload({
      secret: "easner_whsec_test",
      body,
      timestampSeconds,
    })
    expect(
      verifyMerchantWebhookPayload({
        secret: "easner_whsec_test",
        body,
        signatureHeader: header,
        nowSeconds: timestampSeconds,
      }),
    ).toBe(true)
  })

  it("rejects a tampered body", () => {
    const header = signMerchantWebhookPayload({
      secret: "easner_whsec_test",
      body: '{"ok":true}',
      timestampSeconds: 1_700_000_000,
    })
    expect(
      verifyMerchantWebhookPayload({
        secret: "easner_whsec_test",
        body: '{"ok":false}',
        signatureHeader: header,
        nowSeconds: 1_700_000_000,
      }),
    ).toBe(false)
  })
})

describe("subscribed webhook events", () => {
  it("keeps checkout events when the column is empty", () => {
    expect(normalizeSubscribedWebhookEvents(null)).toContain("checkout.completed")
    expect(normalizeSubscribedWebhookEvents(["account.updated"])).toEqual(["account.updated"])
    expect(normalizeSubscribedWebhookEvents([])).toEqual([])
  })
})

describe("checkout.completed payload", () => {
  it("passes merchant metadata and strips reserved keys", () => {
    const data = checkoutCompletedWebhookData({
      checkoutSessionId: "cs_123",
      mode: "subscription",
      amountCents: 4900,
      currency: "usd",
      customerEmail: "user@example.com",
      subscriptionId: "sub_123",
      metadata: { user_id: "123", plan: "pro", easner_business_id: "biz" },
      paidAt: "2026-08-26T00:00:00.000Z",
      livemode: true,
    })
    expect(data).toMatchObject({
      checkout_session_id: "cs_123",
      mode: "subscription",
      amount_cents: 4900,
      currency: "USD",
      customer_email: "user@example.com",
      subscription_id: "sub_123",
      metadata: { user_id: "123", plan: "pro" },
      livemode: true,
    })
    expect(data.metadata).not.toHaveProperty("easner_business_id")
  })
})

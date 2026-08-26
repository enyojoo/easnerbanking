import { describe, expect, it } from "vitest"
import {
  CHECKOUT_PHASES,
  checkoutSetupComplete,
  completedCheckoutSteps,
  firstIncompletePhase,
  phaseComplete,
} from "./checkout-phases"
import type { CheckoutHubPayload } from "@/lib/checkout/hub-types"

function payload(partial: {
  ready?: boolean
} & Partial<CheckoutHubPayload["settings"]>): CheckoutHubPayload {
  const { ready, ...settings } = partial
  return {
    settings: {
      feeMode: "merchant_net",
      businessFeeMode: null,
      feeModeManagedByEasner: false,
      onlinePaymentsEnabled: true,
      allowedOrigins: [],
      defaultSuccessUrl: null,
      defaultCancelUrl: null,
      webhookUrl: null,
      webhookSecretLast4: null,
      liveModeEnabled: false,
      testPaymentCompletedAt: null,
      lastWebhookDeliveredAt: null,
      ...settings,
    },
    readiness: { ready: ready ?? false, reason: null },
    sites: [],
    keys: [],
    webhookEvents: {} as CheckoutHubPayload["webhookEvents"],
  }
}

describe("checkout phases", () => {
  it("starts at connect site when nothing is complete", () => {
    expect(firstIncompletePhase(payload({}))).toBe("connect_site")
  })

  it("marks integrate complete once keys exist", () => {
    const data = payload({
      ready: true,
      businessFeeMode: "merchant_net",
      allowedOrigins: ["https://a.com"],
      defaultSuccessUrl: "https://a.com/ok",
    })
    data.keys = [
      {
        id: "1",
        mode: "test",
        publishable_key: "easner_pk_test_x",
        secret_key_last4: "abcd",
        created_at: "",
        last_used_at: null,
      },
    ]
    const done = completedCheckoutSteps(data)
    const integrate = CHECKOUT_PHASES.find((p) => p.id === "integrate")!
    expect(phaseComplete(integrate, done)).toBe(true)
    expect(checkoutSetupComplete(data)).toBe(false)
  })

  it("marks setup complete after keys, a webhook, and a test payment", () => {
    const data = payload({
      ready: true,
      businessFeeMode: "merchant_net",
      allowedOrigins: ["https://a.com"],
      defaultSuccessUrl: "https://a.com/ok",
      webhookUrl: "https://a.com/hooks",
      webhookSecretLast4: "wxyz",
      testPaymentCompletedAt: "2026-08-26T00:00:00.000Z",
      lastWebhookDeliveredAt: "2026-08-26T00:00:00.000Z",
    })
    data.keys = [
      {
        id: "1",
        mode: "test",
        publishable_key: "easner_pk_test_x",
        secret_key_last4: "abcd",
        created_at: "",
        last_used_at: null,
      },
    ]
    expect(checkoutSetupComplete(data)).toBe(true)
  })

  it("treats website and urls as incomplete for a new site even if others exist", () => {
    const data = payload({
      ready: true,
      businessFeeMode: "merchant_net",
      allowedOrigins: ["https://a.com"],
      defaultSuccessUrl: "https://a.com/ok",
    })
    data.sites = [
      {
        id: "site_a",
        origin: "https://a.com",
        successUrl: "https://a.com/ok",
        cancelUrl: null,
        createdAt: "",
        updatedAt: "",
      },
    ]
    const done = completedCheckoutSteps(data, null)
    expect(done.has("website")).toBe(false)
    expect(done.has("urls")).toBe(false)
    expect(completedCheckoutSteps(data).has("website")).toBe(true)
    expect(completedCheckoutSteps(data, data.sites[0]).has("urls")).toBe(true)
  })
})

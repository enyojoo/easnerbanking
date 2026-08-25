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
  integration?: CheckoutHubPayload["integration"]
} & Partial<Omit<CheckoutHubPayload["settings"], "branding">>): CheckoutHubPayload {
  const { ready, integration, ...settings } = partial
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
      branding: { brandColor: null, buttonRadius: "pill" },
      ...settings,
    },
    readiness: { ready: ready ?? false, reason: null },
    sites: [],
    keys: [],
    webhookEvents: {} as CheckoutHubPayload["webhookEvents"],
    integration: integration ?? { sessionCreatedAt: null, webhookDeliveredAt: null },
  }
}

const TEST_KEY = {
  id: "1",
  mode: "test" as const,
  publishable_key: "easner_pk_test_x",
  secret_key_last4: "abcd",
  created_at: "",
  last_used_at: null,
}

describe("checkout phases", () => {
  it("starts at connect site when nothing is complete", () => {
    expect(firstIncompletePhase(payload({}))).toBe("connect_site")
  })

  it("does not call integrate complete on keys alone – a session must exist", () => {
    const data = payload({
      ready: true,
      allowedOrigins: ["https://a.com"],
      defaultSuccessUrl: "https://a.com/ok",
    })
    data.keys = [TEST_KEY]
    const done = completedCheckoutSteps(data)
    const integrate = CHECKOUT_PHASES.find((p) => p.id === "integrate")!
    expect(done.has("keys")).toBe(true)
    expect(done.has("session")).toBe(false)
    expect(phaseComplete(integrate, done)).toBe(false)
  })

  it("marks integrate complete once a session was created through the API", () => {
    const data = payload({
      ready: true,
      allowedOrigins: ["https://a.com"],
      defaultSuccessUrl: "https://a.com/ok",
      integration: { sessionCreatedAt: "2026-08-25T10:00:00Z", webhookDeliveredAt: null },
    })
    data.keys = [TEST_KEY]
    const done = completedCheckoutSteps(data)
    const integrate = CHECKOUT_PHASES.find((p) => p.id === "integrate")!
    expect(done.has("session")).toBe(true)
    expect(done.has("snippet")).toBe(true)
    expect(phaseComplete(integrate, done)).toBe(true)
    expect(checkoutSetupComplete(data)).toBe(false)
  })

  it("requires an accepted delivery, not just a configured URL, for the webhook step", () => {
    const configuredOnly = payload({
      webhookUrl: "https://a.com/hooks",
      webhookSecretLast4: "wxyz",
    })
    expect(completedCheckoutSteps(configuredOnly).has("webhook")).toBe(false)

    const delivered = payload({
      webhookUrl: "https://a.com/hooks",
      webhookSecretLast4: "wxyz",
      integration: { sessionCreatedAt: null, webhookDeliveredAt: "2026-08-25T10:00:00Z" },
    })
    expect(completedCheckoutSteps(delivered).has("webhook")).toBe(true)
  })

  it("marks setup complete with session evidence and a delivered webhook", () => {
    const data = payload({
      ready: true,
      allowedOrigins: ["https://a.com"],
      defaultSuccessUrl: "https://a.com/ok",
      webhookUrl: "https://a.com/hooks",
      webhookSecretLast4: "wxyz",
      integration: {
        sessionCreatedAt: "2026-08-25T10:00:00Z",
        webhookDeliveredAt: "2026-08-25T10:05:00Z",
      },
    })
    data.keys = [TEST_KEY]
    expect(checkoutSetupComplete(data)).toBe(true)
  })

  it("falls back to the legacy heuristics for cached payloads without integration data", () => {
    const data = payload({
      ready: true,
      allowedOrigins: ["https://a.com"],
      defaultSuccessUrl: "https://a.com/ok",
      webhookUrl: "https://a.com/hooks",
      webhookSecretLast4: "wxyz",
    })
    data.keys = [TEST_KEY]
    delete (data as { integration?: unknown }).integration
    expect(checkoutSetupComplete(data)).toBe(true)
  })

  it("treats website and urls as incomplete for a new site even if others exist", () => {
    const data = payload({
      ready: true,
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

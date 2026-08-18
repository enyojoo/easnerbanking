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
      ...settings,
    },
    readiness: { ready: ready ?? false, reason: null },
    keys: [],
    webhookEvents: {} as CheckoutHubPayload["webhookEvents"],
  }
}

describe("checkout phases", () => {
  it("starts at get ready when nothing is complete", () => {
    expect(firstIncompletePhase(payload({}))).toBe("get_ready")
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

  it("marks setup complete after keys and a webhook, without an in-app test payment", () => {
    const data = payload({
      ready: true,
      businessFeeMode: "merchant_net",
      allowedOrigins: ["https://a.com"],
      defaultSuccessUrl: "https://a.com/ok",
      webhookUrl: "https://a.com/hooks",
      webhookSecretLast4: "wxyz",
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
})

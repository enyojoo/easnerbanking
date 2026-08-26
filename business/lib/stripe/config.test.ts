import { afterEach, describe, expect, it } from "vitest"
import {
  getStripePublishableKey,
  getStripeSecretKey,
  getStripeWebhookSecret,
  isStripeTestPaymentsConfigured,
} from "./config"

const KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_LIVE_SECRET_KEY",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY",
  "STRIPE_TEST_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_TEST_WEBHOOK_SECRET",
] as const

const prior: Record<string, string | undefined> = {}

describe("stripe test vs live keys", () => {
  afterEach(() => {
    for (const name of KEYS) {
      if (prior[name] == null) delete process.env[name]
      else process.env[name] = prior[name]
    }
  })

  it("keeps live keys on the default getters when only live credentials are set", () => {
    snapshot()
    process.env.STRIPE_SECRET_KEY = "sk_live_aaa"
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_bbb"
    delete process.env.STRIPE_TEST_SECRET_KEY
    delete process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY

    expect(getStripeSecretKey()).toBe("sk_live_aaa")
    expect(getStripePublishableKey()).toBe("pk_live_bbb")
    expect(getStripeSecretKey(false)).toBe("")
    expect(getStripePublishableKey(false)).toBe("")
    expect(isStripeTestPaymentsConfigured()).toBe(false)
  })

  it("uses dedicated test keys when merchant checkout is in test mode", () => {
    snapshot()
    process.env.STRIPE_SECRET_KEY = "sk_live_aaa"
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_bbb"
    process.env.STRIPE_TEST_SECRET_KEY = "sk_test_ccc"
    process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY = "pk_test_ddd"
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_live"
    process.env.STRIPE_TEST_WEBHOOK_SECRET = "whsec_test"

    expect(getStripeSecretKey(true)).toBe("sk_live_aaa")
    expect(getStripeSecretKey(false)).toBe("sk_test_ccc")
    expect(getStripePublishableKey(true)).toBe("pk_live_bbb")
    expect(getStripePublishableKey(false)).toBe("pk_test_ddd")
    expect(getStripeWebhookSecret(true)).toBe("whsec_live")
    expect(getStripeWebhookSecret(false)).toBe("whsec_test")
    expect(isStripeTestPaymentsConfigured()).toBe(true)
  })

  it("reuses STRIPE_SECRET_KEY for test mode when it is already a test key", () => {
    snapshot()
    process.env.STRIPE_SECRET_KEY = "sk_test_local"
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_local"
    delete process.env.STRIPE_TEST_SECRET_KEY
    delete process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY

    expect(getStripeSecretKey(false)).toBe("sk_test_local")
    expect(getStripePublishableKey(false)).toBe("pk_test_local")
    expect(isStripeTestPaymentsConfigured()).toBe(true)
  })
})

function snapshot() {
  for (const name of KEYS) {
    prior[name] = process.env[name]
  }
}

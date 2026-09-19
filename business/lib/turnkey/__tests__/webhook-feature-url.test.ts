import { afterEach, describe, expect, it } from "vitest"
import { getTurnkeyWebhookFeatureUrl } from "../config"

const ENV_KEYS = [
  "TURNKEY_WEBHOOK_URL",
  "BUSINESS_APP_URL",
  "NEXT_PUBLIC_BUSINESS_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const

describe("getTurnkeyWebhookFeatureUrl", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("defaults to api.easner.com when host env is unset", () => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    expect(getTurnkeyWebhookFeatureUrl()).toBe("https://api.easner.com/api/webhooks/turnkey")
  })
})

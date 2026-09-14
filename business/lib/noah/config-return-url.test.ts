import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getNoahBusinessReturnUrl, getNoahReturnUrl } from "./config"

const ENV_KEYS = [
  "NOAH_ONBOARDING_RETURN_URL",
  "NOAH_BUSINESS_ONBOARDING_RETURN_URL",
  "NEXT_PUBLIC_BUSINESS_APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const

describe("Noah hosted return URLs", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("defaults KYC and KYB to the shared onboarding-complete page", () => {
    expect(getNoahReturnUrl()).toBe("https://business.easner.com/auth/onboarding-complete?context=kyc")
    expect(getNoahBusinessReturnUrl()).toBe(
      "https://business.easner.com/auth/onboarding-complete?context=business",
    )
  })

  it("rewrites leftover /auth/noah-complete env URLs", () => {
    process.env.NOAH_ONBOARDING_RETURN_URL =
      "https://business.easner.com/auth/noah-complete?context=kyc"
    process.env.NOAH_BUSINESS_ONBOARDING_RETURN_URL =
      "https://business.easner.com/auth/noah-complete?context=kyb"

    expect(getNoahReturnUrl()).toBe("https://business.easner.com/auth/onboarding-complete?context=kyc")
    expect(getNoahBusinessReturnUrl()).toBe(
      "https://business.easner.com/auth/onboarding-complete?context=kyb",
    )
  })
})

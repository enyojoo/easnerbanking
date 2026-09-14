import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  canonicalizeHostedOnboardingReturnUrl,
  getHostedOnboardingReturnUrl,
  isHostedOnboardingCompleteUrl,
} from "./hosted-onboarding-complete"

const ENV_KEYS = [
  "NEXT_PUBLIC_BUSINESS_APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const

describe("hosted onboarding complete URL", () => {
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

  it("builds a provider-neutral return URL", () => {
    expect(getHostedOnboardingReturnUrl("kyc")).toBe(
      "https://business.easner.com/auth/onboarding-complete?context=kyc",
    )
    expect(getHostedOnboardingReturnUrl("business")).toBe(
      "https://business.easner.com/auth/onboarding-complete?context=business",
    )
  })

  it("rewrites leftover provider-named complete paths", () => {
    expect(
      canonicalizeHostedOnboardingReturnUrl(
        "https://business.easner.com/auth/noah-complete?context=kyc",
      ),
    ).toBe("https://business.easner.com/auth/onboarding-complete?context=kyc")
    expect(
      canonicalizeHostedOnboardingReturnUrl(
        "https://business.easner.com/auth/grid-complete?context=business",
      ),
    ).toBe("https://business.easner.com/auth/onboarding-complete?context=business")
    expect(
      canonicalizeHostedOnboardingReturnUrl("https://example.com/custom-return"),
    ).toBe("https://example.com/custom-return")
  })

  it("treats legacy and canonical paths as complete URLs", () => {
    expect(isHostedOnboardingCompleteUrl("https://business.easner.com/auth/onboarding-complete")).toBe(
      true,
    )
    expect(isHostedOnboardingCompleteUrl("https://business.easner.com/auth/noah-complete?context=kyc")).toBe(
      true,
    )
    expect(isHostedOnboardingCompleteUrl("https://business.easner.com/auth/login")).toBe(false)
  })
})

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  getBridgeBaseUrl,
  getBridgeBusinessKybReturnUrl,
  getBridgeKycReturnUrl,
} from "./config"

const ENV_KEYS = [
  "BRIDGE_BASE_URL",
  "BRIDGE_KYC_RETURN_URL",
  "BRIDGE_BUSINESS_KYB_RETURN_URL",
  "NOAH_ONBOARDING_RETURN_URL",
  "GRID_BUSINESS_KYB_RETURN_URL",
  "NEXT_PUBLIC_BUSINESS_APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const

describe("bridge config", () => {
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

  it("defaults the API host to production, not sandbox", () => {
    expect(getBridgeBaseUrl()).toBe("https://api.bridge.xyz")
  })

  it("uses the shared onboarding-complete return URL", () => {
    process.env.NOAH_ONBOARDING_RETURN_URL = "https://business.easner.com/auth/noah-complete?context=kyc"
    process.env.GRID_BUSINESS_KYB_RETURN_URL =
      "https://business.easner.com/auth/grid-complete?context=business"

    expect(getBridgeKycReturnUrl()).toBe("https://business.easner.com/auth/onboarding-complete?context=kyc")
    expect(getBridgeBusinessKybReturnUrl()).toBe(
      "https://business.easner.com/auth/onboarding-complete?context=business",
    )
  })

  it("rewrites leftover provider-named return URLs", () => {
    process.env.BRIDGE_KYC_RETURN_URL = "https://business.easner.com/auth/noah-complete?context=kyc"
    expect(getBridgeKycReturnUrl()).toBe("https://business.easner.com/auth/onboarding-complete?context=kyc")
  })
})

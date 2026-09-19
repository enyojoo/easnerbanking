import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getAppSurface,
  getAppSurfaceFromHostname,
  getProductSwitchUrl,
  isBankingOnlyPath,
  isPlatformOnlyPath,
  isProductHostSplit,
} from "./app-surface"

describe("getAppSurface", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("reads NEXT_PUBLIC_APP_SURFACE", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "platform")
    expect(getAppSurface()).toBe("platform")
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "business")
    expect(getAppSurface()).toBe("business")
  })

  it("defaults to business", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "")
    expect(getAppSurface()).toBe("business")
  })

  it("treats platform.easner.com as Platform when env is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "")
    expect(getAppSurfaceFromHostname("platform.easner.com")).toBe("platform")
    expect(getAppSurfaceFromHostname("business.easner.com")).toBe("business")
    expect(getAppSurfaceFromHostname(null)).toBe("business")
  })
})

describe("product paths", () => {
  it("marks Checkout, Developers, and Customers as Platform-only", () => {
    expect(isPlatformOnlyPath("/checkout")).toBe(true)
    expect(isPlatformOnlyPath("/checkout/site_1")).toBe(true)
    expect(isPlatformOnlyPath("/developers")).toBe(true)
    expect(isPlatformOnlyPath("/customers")).toBe(true)
    expect(isPlatformOnlyPath("/dashboard")).toBe(false)
  })

  it("marks banking routes as Business-only", () => {
    expect(isBankingOnlyPath("/send")).toBe(true)
    expect(isBankingOnlyPath("/invoices/new")).toBe(true)
    expect(isBankingOnlyPath("/checkout")).toBe(false)
    expect(isBankingOnlyPath("/settings")).toBe(false)
  })
})

describe("host split", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is false until PLATFORM_APP_URL is set", () => {
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_APP_URL", "")
    expect(isProductHostSplit()).toBe(false)
  })

  it("builds switch URLs from configured origins", () => {
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_APP_URL", "https://platform.easner.com")
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_APP_URL", "https://business.easner.com")
    expect(getProductSwitchUrl("platform", "/checkout")).toBe("https://platform.easner.com/checkout")
    expect(getProductSwitchUrl("business", "/dashboard")).toBe("https://business.easner.com/dashboard")
  })
})

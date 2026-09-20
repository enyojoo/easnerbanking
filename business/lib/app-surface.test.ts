import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getAppSurface,
  getAppSurfaceFromHostname,
  getClientAppSurface,
  getProductSwitchPath,
  getProductSwitchUrl,
  getWorkspaceHomePath,
  isBankingOnlyPath,
  isForcedPlatformSurface,
  isPlatformOnlyPath,
  isProductHostSplit,
  resolveAppSurface,
} from "./app-surface"
import { readDevPlatformFlag, resolveDevPlatformAccess } from "./dev-platform-access"

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

describe("resolveAppSurface order", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("uses env over hostname and cookie", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "business")
    expect(
      resolveAppSurface({ hostname: "platform.easner.com", cookie: "platform" }),
    ).toBe("business")
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "platform")
    expect(
      resolveAppSurface({ hostname: "business.easner.com", cookie: "business" }),
    ).toBe("platform")
  })

  it("uses hostname over cookie when env is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "")
    expect(
      resolveAppSurface({ hostname: "platform.easner.com", cookie: "business" }),
    ).toBe("platform")
  })

  it("uses cookie over the business default", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "")
    expect(
      resolveAppSurface({ hostname: "business.easner.com", cookie: "platform" }),
    ).toBe("platform")
    expect(resolveAppSurface({ hostname: "business.easner.com", cookie: "junk" })).toBe(
      "business",
    )
    expect(resolveAppSurface({ hostname: "business.easner.com", cookie: null })).toBe(
      "business",
    )
  })
})

describe("product paths", () => {
  it("marks Console, Checkout, and Customers as Platform-only", () => {
    expect(isPlatformOnlyPath("/console")).toBe(true)
    expect(isPlatformOnlyPath("/console/keys")).toBe(true)
    expect(isPlatformOnlyPath("/checkout")).toBe(true)
    expect(isPlatformOnlyPath("/checkout/site_1")).toBe(true)
    expect(isPlatformOnlyPath("/developers")).toBe(false)
    expect(isPlatformOnlyPath("/customers")).toBe(true)
    expect(isPlatformOnlyPath("/dashboard")).toBe(false)
    expect(isPlatformOnlyPath("/accounts")).toBe(false)
  })

  it("marks banking routes as Business-only", () => {
    expect(isBankingOnlyPath("/send")).toBe(true)
    expect(isBankingOnlyPath("/invoices/new")).toBe(true)
    expect(isBankingOnlyPath("/checkout")).toBe(false)
    expect(isBankingOnlyPath("/accounts")).toBe(false)
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

  it("returns in-app switch paths when hosts are not split", () => {
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_APP_URL", "")
    expect(getProductSwitchPath("platform")).toBe("/console")
    expect(getProductSwitchPath("business")).toBe("/dashboard")
    expect(getProductSwitchUrl("platform")).toBe("/console")
    expect(getProductSwitchUrl("business")).toBe("/dashboard")
    expect(getProductSwitchUrl("platform", "/console/keys")).toBe("/console/keys")
  })

  it("opens the stored mode home after login", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "")
    expect(getProductSwitchPath(resolveAppSurface({ cookie: "platform" }))).toBe("/console")
    expect(getProductSwitchPath(resolveAppSurface({ cookie: "business" }))).toBe("/dashboard")
    expect(getProductSwitchPath(resolveAppSurface({ cookie: null }))).toBe("/dashboard")
    expect(getWorkspaceHomePath()).toBe(getProductSwitchPath(getClientAppSurface()))
  })

  it("builds switch URLs from configured origins", () => {
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_APP_URL", "https://platform.easner.com")
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_APP_URL", "https://business.easner.com")
    expect(getProductSwitchUrl("platform", "/checkout")).toBe("https://platform.easner.com/checkout")
    expect(getProductSwitchUrl("business", "/dashboard")).toBe("https://business.easner.com/dashboard")
  })

  it("treats env or platform.* host as forced platform", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "")
    expect(isForcedPlatformSurface("business.easner.com")).toBe(false)
    expect(isForcedPlatformSurface("platform.easner.com")).toBe(true)
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "platform")
    expect(isForcedPlatformSurface("business.easner.com")).toBe(true)
  })
})

describe("dev platform gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("stays on this origin when split is false, flag on or off", () => {
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_APP_URL", "")
    expect(
      resolveDevPlatformAccess({
        surface: "business",
        pathname: "/checkout",
        hasData: true,
        enabled: true,
        split: false,
      }),
    ).toEqual({ action: "allow" })
    expect(
      resolveDevPlatformAccess({
        surface: "business",
        pathname: "/checkout",
        hasData: true,
        enabled: false,
        split: false,
      }),
    ).toEqual({ action: "need-account" })
    expect(
      resolveDevPlatformAccess({
        surface: "platform",
        pathname: "/dashboard",
        hasData: true,
        enabled: true,
        split: false,
      }),
    ).toEqual({ action: "allow" })
    expect(
      resolveDevPlatformAccess({
        surface: "platform",
        pathname: "/send",
        hasData: true,
        enabled: true,
        split: false,
      }),
    ).toEqual({ action: "allow" })
  })

  it("does not redirect to another origin while hosts share this project", () => {
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_APP_URL", "")
    const decisions = [
      resolveDevPlatformAccess({
        surface: "business",
        pathname: "/checkout",
        hasData: true,
        enabled: true,
        split: false,
      }),
      resolveDevPlatformAccess({
        surface: "platform",
        pathname: "/dashboard",
        hasData: true,
        enabled: true,
        split: false,
      }),
    ]
    for (const decision of decisions) {
      expect(decision.action).not.toBe("redirect")
    }
  })

  it("does not treat an unknown Office flag as off", () => {
    expect(readDevPlatformFlag(false, undefined)).toBeNull()
    expect(readDevPlatformFlag(true, undefined)).toBeNull()
    expect(readDevPlatformFlag(true, true)).toBe(true)
    expect(readDevPlatformFlag(true, false)).toBe(false)
    expect(
      resolveDevPlatformAccess({
        surface: "platform",
        pathname: "/checkout",
        hasData: true,
        enabled: null,
        split: false,
      }),
    ).toEqual({ action: "allow" })
  })

  it("redirects only after a configured host split", () => {
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_APP_URL", "https://platform.easner.com")
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_APP_URL", "https://business.easner.com")
    expect(
      resolveDevPlatformAccess({
        surface: "business",
        pathname: "/checkout",
        hasData: true,
        enabled: true,
        split: true,
      }),
    ).toEqual({
      action: "redirect",
      href: "https://platform.easner.com/checkout",
    })
  })
})

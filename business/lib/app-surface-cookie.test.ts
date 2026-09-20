import { describe, expect, it } from "vitest"
import {
  APP_SURFACE_COOKIE_MAX_AGE_SECONDS,
  APP_SURFACE_COOKIE_NAME,
  parseAppSurfaceCookieValue,
  readAppSurfaceCookieFromDocument,
  serializeAppSurfaceClearCookie,
  serializeAppSurfaceSetCookie,
} from "./app-surface-cookie"

describe("parseAppSurfaceCookieValue", () => {
  it("accepts platform", () => {
    expect(parseAppSurfaceCookieValue("platform")).toBe("platform")
    expect(parseAppSurfaceCookieValue("PLATFORM")).toBe("platform")
    expect(parseAppSurfaceCookieValue(" platform ")).toBe("platform")
  })

  it("treats missing and junk as business", () => {
    expect(parseAppSurfaceCookieValue(null)).toBe("business")
    expect(parseAppSurfaceCookieValue(undefined)).toBe("business")
    expect(parseAppSurfaceCookieValue("")).toBe("business")
    expect(parseAppSurfaceCookieValue("banking")).toBe("business")
    expect(parseAppSurfaceCookieValue("yes")).toBe("business")
    expect(parseAppSurfaceCookieValue("business")).toBe("business")
  })
})

describe("readAppSurfaceCookieFromDocument", () => {
  it("returns null when the cookie is absent", () => {
    expect(readAppSurfaceCookieFromDocument("")).toBeNull()
    expect(readAppSurfaceCookieFromDocument("easner_business_session=abc")).toBeNull()
  })

  it("reads the named cookie among others", () => {
    expect(
      readAppSurfaceCookieFromDocument("other=1; easner_app_surface=platform; keep=2"),
    ).toBe("platform")
    expect(readAppSurfaceCookieFromDocument("easner_app_surface=junk")).toBe("business")
  })
})

describe("serializeAppSurfaceSetCookie", () => {
  it("is host-only, Lax, long-lived, and not HttpOnly", () => {
    const value = serializeAppSurfaceSetCookie("platform", { secure: true })
    expect(value).toContain(`${APP_SURFACE_COOKIE_NAME}=platform`)
    expect(value).toContain("Path=/")
    expect(value).toContain("SameSite=Lax")
    expect(value).toContain("Secure")
    expect(value).toContain(`Max-Age=${APP_SURFACE_COOKIE_MAX_AGE_SECONDS}`)
    expect(value.toLowerCase()).not.toContain("domain=")
    expect(value.toLowerCase()).not.toContain("httponly")
  })

  it("omits Secure on http", () => {
    expect(serializeAppSurfaceSetCookie("business")).not.toContain("Secure")
  })

  it("clears with Max-Age=0 and no Domain", () => {
    const value = serializeAppSurfaceClearCookie()
    expect(value).toContain(`${APP_SURFACE_COOKIE_NAME}=`)
    expect(value).toContain("Max-Age=0")
    expect(value.toLowerCase()).not.toContain("domain=")
  })
})

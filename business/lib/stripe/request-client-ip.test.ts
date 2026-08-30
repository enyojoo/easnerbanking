import { describe, expect, it } from "vitest"
import { resolveRequestClientIp, resolveStripeOnrampCustomerIp } from "./request-client-ip"

function requestWith(headers: Record<string, string>): Request {
  return new Request("https://api.easner.com/api/client-ip", { headers })
}

describe("resolveRequestClientIp", () => {
  it("prefers body customerIpAddress", () => {
    const ip = resolveRequestClientIp(requestWith({}), { customerIpAddress: "203.0.113.10" })
    expect(ip).toBe("203.0.113.10")
  })

  it("reads the first x-forwarded-for hop", () => {
    const ip = resolveRequestClientIp(
      requestWith({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" }),
      null,
    )
    expect(ip).toBe("203.0.113.10")
  })

  it("falls back to x-real-ip", () => {
    const ip = resolveRequestClientIp(requestWith({ "x-real-ip": "198.51.100.4" }), null)
    expect(ip).toBe("198.51.100.4")
  })

  it("returns null when no IP is available in production mode", () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    expect(resolveStripeOnrampCustomerIp(new Request("https://api.easner.com"), null)).toBeNull()
    process.env.NODE_ENV = prev
  })

  it("uses localhost fallback in development", () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = "development"
    expect(resolveStripeOnrampCustomerIp(new Request("https://api.easner.com"), null)).toBe(
      "127.0.0.1",
    )
    process.env.NODE_ENV = prev
  })
})

import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import {
  classifyApiRateSurface,
  consumeMemoryRateLimit,
  isV1WriteScope,
  maybeRateLimitApiRequest,
  resetApiRateLimitMemoryForTests,
} from "./rate-limit"

afterEach(() => {
  resetApiRateLimitMemoryForTests()
})

describe("classifyApiRateSurface", () => {
  it("keeps merchant /v1 off the first-party bucket", () => {
    expect(classifyApiRateSurface("/v1/transfers")).toBe("v1")
    expect(classifyApiRateSurface("/api/v1/transfers")).toBe("v1")
    expect(classifyApiRateSurface("/api/transfers")).toBe("first_party")
    expect(classifyApiRateSurface("/api/admin/office/overview")).toBe("first_party")
  })

  it("does not rate-limit webhooks or crons", () => {
    expect(classifyApiRateSurface("/api/webhooks/stripe")).toBe("skip")
    expect(classifyApiRateSurface("/api/internal/payroll/execute-scheduled")).toBe("skip")
    expect(classifyApiRateSurface("/api/cron/sync-noah-rates")).toBe("skip")
  })
})

describe("consumeMemoryRateLimit", () => {
  it("isolates merchant and first-party counters", () => {
    expect(consumeMemoryRateLimit("v1:r:1.1.1.1", 1)).toBe(true)
    expect(consumeMemoryRateLimit("v1:r:1.1.1.1", 1)).toBe(false)
    expect(consumeMemoryRateLimit("first_party:r:1.1.1.1", 1)).toBe(true)
  })
})

describe("maybeRateLimitApiRequest", () => {
  it("returns 429 on /v1 without consuming first-party budget", () => {
    const headers = { "x-forwarded-for": "203.0.113.9" }
    for (let i = 0; i < 30; i += 1) {
      const ok = maybeRateLimitApiRequest(
        new NextRequest("https://api.easner.com/v1/transfers", { method: "POST", headers }),
      )
      expect(ok).toBeNull()
    }
    const blocked = maybeRateLimitApiRequest(
      new NextRequest("https://api.easner.com/v1/transfers", { method: "POST", headers }),
    )
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get("Retry-After")).toBe("60")

    const firstParty = maybeRateLimitApiRequest(
      new NextRequest("https://api.easner.com/api/transfers", { method: "POST", headers }),
    )
    expect(firstParty).toBeNull()
  })

  it("skips OPTIONS", () => {
    const request = new NextRequest("https://api.easner.com/v1/transfers", { method: "OPTIONS" })
    expect(maybeRateLimitApiRequest(request)).toBeNull()
  })
})

describe("isV1WriteScope", () => {
  it("treats send and create scopes as writes", () => {
    expect(isV1WriteScope("transfers.write")).toBe(true)
    expect(isV1WriteScope("accounts.read")).toBe(false)
  })
})

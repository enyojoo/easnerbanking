import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { corsPreflightResponse, getCorsAllowedOrigins } from "./cors"

describe("corsPreflightResponse", () => {
  it("allows Idempotency-Key for app.easner.com balance payout execute", () => {
    const allowed = getCorsAllowedOrigins()
    const request = new NextRequest("https://api.easner.com/api/transfers", {
      method: "OPTIONS",
      headers: {
        origin: "https://app.easner.com",
        "access-control-request-method": "POST",
        "access-control-request-headers":
          "authorization,content-type,x-easner-account-scope,idempotency-key",
      },
    })

    const response = corsPreflightResponse(request, allowed)
    expect(response?.status).toBe(204)
    expect(response?.headers.get("Access-Control-Allow-Headers")).toContain("Idempotency-Key")
    expect(response?.headers.get("Access-Control-Allow-Headers")).toContain(
      "X-Easner-Account-Scope",
    )
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe("https://app.easner.com")
  })

  it("allows the new business Vercel production and unique hosts", () => {
    const allowed = getCorsAllowedOrigins()
    expect(allowed.has("https://easnerbank.vercel.app")).toBe(true)
    for (const origin of [
      "https://easnerbank.vercel.app",
      "https://easnerbank-abc123-easner.vercel.app",
      "https://easner-business.vercel.app",
      "https://easner-business-m9kn60wrk-easner.vercel.app",
    ] as const) {
      const request = new NextRequest("https://api.easner.com/api/business/profile", {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization,content-type",
        },
      })
      const response = corsPreflightResponse(request, allowed)
      expect(response?.status).toBe(204)
      expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(origin)
    }
  })

  it("allows Office Vercel production and unique hosts", () => {
    const allowed = getCorsAllowedOrigins()
    expect(allowed.has("https://easnerbanking-office.vercel.app")).toBe(true)
    for (const origin of [
      "https://easnerbanking-office.vercel.app",
      "https://easnerbanking-office-abc123-easner.vercel.app",
    ] as const) {
      const request = new NextRequest("https://api.easner.com/api/admin/office/overview", {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization,content-type",
        },
      })
      const response = corsPreflightResponse(request, allowed)
      expect(response?.status).toBe(204)
      expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(origin)
    }
  })

  it("allows Business, Platform, payer, and Office origins", () => {
    const allowed = getCorsAllowedOrigins()
    expect(allowed.has("https://business.easner.com")).toBe(true)
    expect(allowed.has("https://platform.easner.com")).toBe(true)
    expect(allowed.has("https://pay.easner.com")).toBe(true)
    expect(allowed.has("https://invoice.easner.com")).toBe(true)
    expect(allowed.has("https://bk.easner.com")).toBe(true)
    expect(allowed.has("http://localhost:3000")).toBe(true)
    expect(allowed.has("http://localhost:3001")).toBe(true)

    for (const origin of [
      "https://business.easner.com",
      "https://platform.easner.com",
      "https://pay.easner.com",
      "https://invoice.easner.com",
      "https://bk.easner.com",
    ] as const) {
      const request = new NextRequest("https://api.easner.com/api/business/profile", {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization,content-type",
        },
      })
      const response = corsPreflightResponse(request, allowed)
      expect(response?.status).toBe(204)
      expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(origin)
      expect(response?.headers.get("Access-Control-Allow-Headers")).toContain("Authorization")
    }
  })

  it("allows Office Return and Mobile send preflight against the api origin", () => {
    const allowed = getCorsAllowedOrigins()
    const office = new NextRequest(
      "https://api.easner.com/api/admin/office/subjects/user/abc/return-remaining",
      {
        method: "OPTIONS",
        headers: {
          origin: "https://bk.easner.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type",
        },
      },
    )
    const officeRes = corsPreflightResponse(office, allowed)
    expect(officeRes?.status).toBe(204)
    expect(officeRes?.headers.get("Access-Control-Allow-Origin")).toBe("https://bk.easner.com")

    const mobile = new NextRequest("https://api.easner.com/api/transfers", {
      method: "OPTIONS",
      headers: {
        origin: "https://app.easner.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type,idempotency-key",
      },
    })
    const mobileRes = corsPreflightResponse(mobile, allowed)
    expect(mobileRes?.status).toBe(204)
    expect(mobileRes?.headers.get("Access-Control-Allow-Origin")).toBe("https://app.easner.com")
  })
})

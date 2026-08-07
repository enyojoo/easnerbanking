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
})

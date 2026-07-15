import { describe, expect, it } from "vitest"
import { createHash, createHmac } from "node:crypto"
import { buildYellowcardAuthHeaders } from "@/lib/yellowcard/http"
import { toYellowcardRequestPath, toYellowcardSignedPath } from "@/lib/yellowcard/config"

describe("buildYellowcardAuthHeaders", () => {
  const apiKey = "test-api-key"
  const apiSecret = "test-api-secret"
  const timestamp = "2026-07-15T12:00:00.000Z"

  it("builds YcHmacV1 Authorization for GET without body", () => {
    const headers = buildYellowcardAuthHeaders({
      path: "/rates",
      method: "GET",
      apiKey,
      apiSecret,
      timestamp,
    })
    expect(headers["X-YC-Timestamp"]).toBe(timestamp)
    expect(headers.Authorization).toMatch(/^YcHmacV1 test-api-key:/)

    const signedPath = toYellowcardSignedPath("/rates")
    const hmac = createHmac("sha256", apiSecret)
    hmac.update(timestamp)
    hmac.update(signedPath)
    hmac.update("GET")
    const expected = hmac.digest("base64")
    expect(headers.Authorization).toBe(`YcHmacV1 ${apiKey}:${expected}`)
  })

  it("includes body hash for POST", () => {
    const body = JSON.stringify({ amount: 100 })
    const headers = buildYellowcardAuthHeaders({
      path: "/send",
      method: "POST",
      body,
      apiKey,
      apiSecret,
      timestamp,
    })
    const signedPath = toYellowcardSignedPath("/send")
    const hashB64 = createHash("sha256").update(body).digest("base64")
    const hmac = createHmac("sha256", apiSecret)
    hmac.update(timestamp)
    hmac.update(signedPath)
    hmac.update("POST")
    hmac.update(hashB64)
    expect(headers.Authorization).toBe(`YcHmacV1 ${apiKey}:${hmac.digest("base64")}`)
  })

  it("throws when credentials missing", () => {
    expect(() =>
      buildYellowcardAuthHeaders({
        path: "/rates",
        method: "GET",
        apiKey: "",
        apiSecret: "",
        timestamp,
      }),
    ).toThrow(/YELLOWCARD_API_KEY/)
  })
})

describe("toYellowcardSignedPath", () => {
  it("prefixes /business", () => {
    expect(toYellowcardSignedPath("/rates")).toBe("/business/rates")
    expect(toYellowcardSignedPath("channels")).toBe("/business/channels")
    expect(toYellowcardSignedPath("/business/send")).toBe("/business/send")
  })

  it("strips query string from signed path", () => {
    expect(toYellowcardSignedPath("/networks?country=MX&currency=MXN")).toBe("/business/networks")
  })
})

describe("toYellowcardRequestPath", () => {
  it("keeps query string on request path", () => {
    expect(toYellowcardRequestPath("/networks?country=MX")).toBe("/business/networks?country=MX")
  })
})

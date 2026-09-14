import { describe, expect, it } from "vitest"
import { BridgeHttpError } from "./http"
import { formatBridgeApiError, formatBridgeKycStartError } from "./format-bridge-api-error"

describe("formatBridgeApiError", () => {
  it("reads nested Bridge error messages", () => {
    const err = new BridgeHttpError("fallback", 400, {
      errors: [{ message: "A KYC link already exists for this email." }],
    })
    expect(formatBridgeApiError(err)).toBe("A KYC link already exists for this email.")
  })
})

describe("formatBridgeKycStartError", () => {
  it("does not name the vendor", () => {
    const err = new BridgeHttpError("Bridge POST /v0/kyc_links failed (500)", 500)
    expect(formatBridgeKycStartError(err)).not.toMatch(/bridge/i)
  })

  it("maps duplicate-email failures to a retryable in-progress message", () => {
    const err = new BridgeHttpError("exists", 400, {
      message: "A customer already exists with this email",
    })
    expect(formatBridgeKycStartError(err)).toMatch(/already in progress/i)
  })
})

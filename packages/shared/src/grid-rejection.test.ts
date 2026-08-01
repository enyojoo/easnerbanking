import { describe, expect, it } from "vitest"
import {
  extractGridCustomerRejectionReasons,
  getVerificationRejectionDisplay,
  normalizeVerificationRejectionReasons,
} from "./grid-rejection"

describe("grid-rejection", () => {
  it("extracts verification error reasons from Grid customer payload", () => {
    const reasons = extractGridCustomerRejectionReasons(
      {
        kybStatus: "REJECTED",
        verificationErrors: [{ reason: "Document is expired", type: "DOCUMENT" }],
      },
      "REJECTED",
    )
    expect(reasons.some((r) => r.message?.includes("expired"))).toBe(true)
  })

  it("unwraps legacy grid envelope for display", () => {
    const display = getVerificationRejectionDisplay({
      gridStatus: "REJECTED",
      raw: {
        kybStatus: "REJECTED",
        moderationComment: "Company registry document is unreadable",
      },
    })
    expect(display.isRetry).toBe(true)
    expect(display.bodyText.toLowerCase()).toContain("unreadable")
  })

  it("normalizes hold status with default guidance", () => {
    const normalized = normalizeVerificationRejectionReasons({
      gridStatus: "HOLD",
      raw: { kybStatus: "HOLD" },
    }) as Array<{ message?: string }>
    expect(normalized[0]?.message?.toLowerCase()).toContain("hold")
  })
})

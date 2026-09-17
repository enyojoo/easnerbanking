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

  it("treats Grid REJECTED as a final decline", () => {
    const reasons = extractGridCustomerRejectionReasons(
      {
        kybStatus: "REJECTED",
        verificationErrors: [{ reason: "Document is expired", type: "DOCUMENT" }],
      },
      "REJECTED",
    )
    expect(reasons.every((r) => r.rejectType === "Final")).toBe(true)

    const display = getVerificationRejectionDisplay(
      {
        gridStatus: "REJECTED",
        raw: {
          kybStatus: "REJECTED",
          moderationComment: "Company registry document is unreadable",
        },
      },
      "rejected",
    )
    expect(display.isFinal).toBe(true)
    expect(display.canResubmit).toBe(false)
  })

  it("treats stored retry reasons as final when status is rejected", () => {
    const display = getVerificationRejectionDisplay(
      [{ rejectType: "Retry", message: "Please upload a clearer document" }],
      "rejected",
    )
    expect(display.isFinal).toBe(true)
    expect(display.canResubmit).toBe(false)
  })

  it("normalizes hold status with default guidance", () => {
    const normalized = normalizeVerificationRejectionReasons({
      gridStatus: "HOLD",
      raw: { kybStatus: "HOLD" },
    }) as Array<{ message?: string }>
    expect(normalized[0]?.message?.toLowerCase()).toContain("hold")
  })

  it("skips machine rejection codes from verification errors", () => {
    const reasons = extractGridCustomerRejectionReasons(
      {
        kybStatus: "HOLD",
        errors: [
          { reason: "The uploaded photo is of poor quality", type: "POOR_QUALITY_DOCUMENT" },
          { reason: "badPhoto", type: "APPLICANT_REJECTED" },
          { reason: "badDocument_suspiciousDocument", type: "APPLICANT_REJECTED" },
        ],
      },
      "HOLD",
    )
    expect(reasons.map((r) => r.message)).toEqual(["The uploaded photo is of poor quality"])
  })
})

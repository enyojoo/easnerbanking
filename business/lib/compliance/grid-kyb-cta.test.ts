import { describe, expect, it } from "vitest"
import { gridKybApplicationIsEditable, gridKybApplicationStatusFromVerification } from "@easner/shared"

describe("first-party KYB CTA state", () => {
  it("keeps resolve_errors editable (Continue verification)", () => {
    const status = gridKybApplicationStatusFromVerification({
      verificationStatus: "RESOLVE_ERRORS",
      localStatus: "in_progress",
    })
    expect(status).toBe("resolve_errors")
    expect(gridKybApplicationIsEditable(status)).toBe(true)
  })

  it("hides edit for in-review / pending", () => {
    const status = gridKybApplicationStatusFromVerification({
      verificationStatus: "PENDING_MANUAL_REVIEW",
      localStatus: "pending",
    })
    expect(status).toBe("in_review")
    expect(gridKybApplicationIsEditable(status)).toBe(false)
  })
})

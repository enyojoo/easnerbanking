import { describe, expect, it } from "vitest"
import { payrollStatusLabel } from "./payroll-status-badge"

describe("payrollStatusLabel", () => {
  it("supports current statuses", () => {
    expect(payrollStatusLabel("pending_consent")).toBe("Awaiting approval")
    expect(payrollStatusLabel("ready")).toBe("Ready")
  })

  it("does not crash for legacy or stale cached records without a status", () => {
    expect(payrollStatusLabel(undefined)).toBe("Needs attention")
    expect(payrollStatusLabel(null)).toBe("Needs attention")
    expect(payrollStatusLabel("custom_status")).toBe("custom status")
  })
})

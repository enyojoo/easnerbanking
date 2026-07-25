import { describe, expect, it } from "vitest"
import { canDeletePayrollRun, DELETABLE_PAYROLL_RUN_STATUSES } from "./run-deletion"

describe("payroll run deletion", () => {
  it("allows drafts and fully failed runs", () => {
    expect(DELETABLE_PAYROLL_RUN_STATUSES).toEqual(["draft", "failed"])
    expect(canDeletePayrollRun("draft")).toBe(true)
    expect(canDeletePayrollRun("failed")).toBe(true)
  })

  it.each([
    "pending_approval",
    "approved",
    "scheduled",
    "executing",
    "completed",
    "partial",
    "needs_reapproval",
    "cancelled",
  ] as const)("retains payroll history in %s state", (status) => {
    expect(canDeletePayrollRun(status)).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import {
  canSelfApprovePayroll,
  requiresDifferentPayrollApprover,
} from "@/lib/payroll/approval-policy"

describe("Payroll approval policy", () => {
  it.each(["Owner", "Admin"] as const)(
    "allows a business %s to submit and approve the same run",
    (businessRole) => {
      expect(
        requiresDifferentPayrollApprover({
          requireSeparateApprover: true,
          businessRole,
          submittedBy: "user-1",
          approverUserId: "user-1",
        }),
      ).toBe(false)
      expect(canSelfApprovePayroll({ requireSeparateApprover: true, businessRole })).toBe(true)
    },
  )

  it("enforces separation for a delegated approver who submitted the run", () => {
    expect(
      requiresDifferentPayrollApprover({
        requireSeparateApprover: true,
        businessRole: "Member",
        submittedBy: "user-1",
        approverUserId: "user-1",
      }),
    ).toBe(true)
  })

  it("allows a different delegated approver", () => {
    expect(
      requiresDifferentPayrollApprover({
        requireSeparateApprover: true,
        businessRole: "Member",
        submittedBy: "user-1",
        approverUserId: "user-2",
      }),
    ).toBe(false)
  })
})

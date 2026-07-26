import { describe, expect, it } from "vitest"
import { safePayrollReturnTo } from "./navigation"

describe("safePayrollReturnTo", () => {
  it("preserves a filtered Payroll list URL", () => {
    expect(
      safePayrollReturnTo(
        "/payroll/people?view=ready&q=amina",
        "/payroll/people",
      ),
    ).toBe("/payroll/people?view=ready&q=amina")
  })

  it("rejects external and unrelated routes", () => {
    expect(safePayrollReturnTo("//example.com", "/payroll/runs")).toBe("/payroll/runs")
    expect(safePayrollReturnTo("/payroll/people", "/payroll/runs")).toBe("/payroll/runs")
  })
})

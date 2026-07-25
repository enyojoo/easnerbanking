import { describe, expect, it } from "vitest"
import { PAYROLL_PAYDAY_TIMES, payrollTimezoneOptions } from "@/lib/payroll/options"

describe("Payroll settings options", () => {
  it("offers every half-hour payday time", () => {
    expect(PAYROLL_PAYDAY_TIMES).toHaveLength(48)
    expect(PAYROLL_PAYDAY_TIMES[0].value).toBe("00:00")
    expect(PAYROLL_PAYDAY_TIMES.at(-1)?.value).toBe("23:30")
  })

  it("retains the currently configured timezone", () => {
    expect(payrollTimezoneOptions("Africa/Lagos")).toContain("Africa/Lagos")
    expect(payrollTimezoneOptions("UTC")).toContain("UTC")
  })
})

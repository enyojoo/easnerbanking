import { describe, expect, it } from "vitest"
import { payrollPaydayPreview } from "./schedule-preview"

describe("payrollPaydayPreview", () => {
  it("moves weekend paydays to the previous business day", () => {
    expect(payrollPaydayPreview({
      frequency: "weekly",
      firstPayday: "2026-07-25",
      weekendPolicy: "previous_business_day",
      count: 2,
    })).toEqual(["2026-07-24", "2026-07-31"])
  })

  it("previews twice-monthly dates", () => {
    expect(payrollPaydayPreview({
      frequency: "semimonthly",
      firstPayday: "2026-07-01",
      weekendPolicy: "next_business_day",
      count: 3,
    })).toEqual(["2026-07-01", "2026-07-15", "2026-08-03"])
  })
})

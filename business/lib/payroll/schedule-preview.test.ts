import { describe, expect, it } from "vitest"
import {
  payrollPaydayPreview,
  payrollPayPeriodForPayday,
  payrollScheduleOccurrence,
  payrollDateTimeToUtc,
} from "./schedule-preview"

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

  it("derives the run pay period from the schedule frequency and nominal payday", () => {
    expect(payrollPayPeriodForPayday("biweekly", "2026-07-24")).toEqual({
      start: "2026-07-11",
      end: "2026-07-24",
    })
    expect(payrollPayPeriodForPayday("monthly", "2026-07-31")).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    })
  })

  it("derives an immutable run occurrence from schedule timing", () => {
    expect(payrollScheduleOccurrence({
      frequency: "weekly",
      nextRunAt: "2026-07-25",
      weekendPolicy: "previous_business_day",
    })).toEqual({
      payPeriodStart: "2026-07-19",
      payPeriodEnd: "2026-07-25",
      payday: "2026-07-24",
    })
  })

  it("converts the configured local payday time to UTC", () => {
    expect(payrollDateTimeToUtc("2026-07-24", "09:00", "Africa/Lagos")).toBe(
      "2026-07-24T08:00:00.000Z",
    )
  })
})

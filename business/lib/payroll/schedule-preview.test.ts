import { describe, expect, it } from "vitest"
import {
  payrollPaydayPreview,
  payrollPayPeriodForPayday,
  payrollScheduleOccurrence,
  payrollDateTimeToUtc,
  payrollLocalDate,
  payrollTimingPreview,
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
    expect(payrollDateTimeToUtc("2026-07-24", "09:00", "Europe/London")).toBe(
      "2026-07-24T08:00:00.000Z",
    )
    expect(payrollDateTimeToUtc("2026-07-24", "09:00", "America/New_York")).toBe(
      "2026-07-24T13:00:00.000Z",
    )
    expect(payrollDateTimeToUtc("2026-07-24", "09:00", "Asia/Dubai")).toBe(
      "2026-07-24T05:00:00.000Z",
    )
    expect(payrollDateTimeToUtc("2026-07-24", "09:00", "Australia/Sydney")).toBe(
      "2026-07-23T23:00:00.000Z",
    )
  })

  it("handles skipped and repeated daylight-saving times deterministically", () => {
    expect(payrollDateTimeToUtc("2026-03-08", "02:30", "America/New_York")).toBe(
      "2026-03-08T07:30:00.000Z",
    )
    expect(payrollDateTimeToUtc("2026-11-01", "01:30", "America/New_York")).toBe(
      "2026-11-01T05:30:00.000Z",
    )
  })

  it("resolves the business-local date and timing preview", () => {
    expect(payrollLocalDate("2026-07-24T23:30:00.000Z", "Africa/Lagos")).toBe("2026-07-25")
    expect(payrollTimingPreview({
      payday: "2026-07-24",
      localTime: "09:00",
      timezone: "Africa/Lagos",
    })).toMatchObject({
      scheduledAt: "2026-07-24T08:00:00.000Z",
      localTime: "09:00",
      timezone: "Africa/Lagos",
    })
  })
})

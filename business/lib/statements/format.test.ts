import { describe, expect, it } from "vitest"
import {
  clipPeriodToAccountOpen,
  formatAvailableAsOf,
  formatStatementCalendarDate,
  formatStatementMoney,
  formatStatementPeriodLabel,
  parseIsoDateOnly,
  resolveTimeZone,
} from "./format"

describe("statement format", () => {
  it("parses ISO dates and rejects invalid calendar days", () => {
    expect(parseIsoDateOnly("2026-07-13")).toBe("2026-07-13")
    expect(parseIsoDateOnly("2026-02-31")).toBeNull()
    expect(parseIsoDateOnly("13 Jul 2026")).toBeNull()
  })

  it("formats calendar dates and periods", () => {
    expect(formatStatementCalendarDate("2026-07-13")).toBe("13 Jul 2026")
    expect(formatStatementPeriodLabel("2026-07-13", "2026-08-29")).toBe("13 Jul 2026 – 29 Aug 2026")
  })

  it("omits .00 on whole amounts", () => {
    expect(formatStatementMoney(19, "USD")).toBe("$19")
    expect(formatStatementMoney(1.5, "USD")).toBe("$1.50")
    expect(formatStatementMoney(2575, "NGN")).toBe("₦2,575")
  })

  it("clips the period to account open and today", () => {
    expect(
      clipPeriodToAccountOpen({
        fromIso: "2026-01-01",
        toIso: "2026-12-31",
        accountOpenedIso: "2026-07-13",
        todayIso: "2026-08-29",
      }),
    ).toEqual({ fromIso: "2026-07-13", toIso: "2026-08-29" })
  })

  it("falls back invalid time zones to UTC", () => {
    expect(resolveTimeZone("Africa/Lagos")).toBe("Africa/Lagos")
    expect(resolveTimeZone("not/a-zone")).toBe("UTC")
  })

  it("formats available-as-of with a zone abbreviation", () => {
    const label = formatAvailableAsOf(new Date("2026-08-29T17:40:00.000Z"), "Africa/Lagos")
    expect(label).toMatch(/29 Aug 2026/)
    expect(label).toMatch(/18:40/)
    expect(label).toMatch(/WAT|GMT\+1/)
  })
})

import { describe, expect, it } from "vitest"
import { getDateRange, ledgerListRangeParams } from "./transactions"

describe("getDateRange", () => {
  it("covers all history for All time, including the rest of today", () => {
    const { start, end } = getDateRange({
      timePeriod: "all",
      customDateRange: { from: undefined, to: undefined },
    })
    expect(start.getTime()).toBe(new Date(0).getTime())
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
  })

  it("uses the full custom end day so the selected last day is included", () => {
    const { start, end } = getDateRange({
      timePeriod: "custom",
      customDateRange: {
        from: new Date(2026, 8, 1, 15, 0, 0),
        to: new Date(2026, 8, 10, 8, 0, 0),
      },
    })
    expect(start.getDate()).toBe(1)
    expect(start.getHours()).toBe(0)
    expect(end.getDate()).toBe(10)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
  })
})

describe("ledgerListRangeParams", () => {
  it("omits bounds for All time so the API returns the full feed", () => {
    expect(
      ledgerListRangeParams({
        timePeriod: "all",
        customDateRange: { from: undefined, to: undefined },
      }),
    ).toEqual({})
  })

  it("sends from/to for a bounded period", () => {
    const params = ledgerListRangeParams({
      timePeriod: "7d",
      customDateRange: { from: undefined, to: undefined },
    })
    expect(params.from).toBeTruthy()
    expect(params.to).toBeTruthy()
    expect(Date.parse(params.from!)).toBeLessThan(Date.parse(params.to!))
  })
})

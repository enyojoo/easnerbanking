import { describe, expect, it } from "vitest"
import {
  ACCOUNT_RESTRICTION_WIND_DOWN_MS,
  computeAccountRestrictionPhase,
  formatAccountRestrictionDeadline,
} from "@easner/shared"

describe("account restriction shared", () => {
  it("computes wind_down before deadline and locked after", () => {
    const restrictedAt = "2026-09-01T12:00:00.000Z"
    const windDownEndsAt = "2026-09-03T12:00:00.000Z"
    expect(
      computeAccountRestrictionPhase({
        restrictedAt,
        windDownEndsAt,
        now: Date.parse("2026-09-02T12:00:00.000Z"),
      }),
    ).toBe("wind_down")
    expect(
      computeAccountRestrictionPhase({
        restrictedAt,
        windDownEndsAt,
        now: Date.parse("2026-09-03T12:00:01.000Z"),
      }),
    ).toBe("locked")
  })

  it("formats deadline", () => {
    const formatted = formatAccountRestrictionDeadline("2026-09-03T12:00:00.000Z", "en-US")
    expect(formatted).toMatch(/Sep/)
  })

  it("wind-down window is 48 hours", () => {
    expect(ACCOUNT_RESTRICTION_WIND_DOWN_MS).toBe(48 * 60 * 60 * 1000)
  })
})

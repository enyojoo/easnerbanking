import { describe, expect, it } from "vitest"
import {
  ACCOUNT_RESTRICTION_WIND_DOWN_MS,
  accountRestrictionLockedCopy,
  accountRestrictionOfficeCanLift,
  computeAccountRestrictionPhase,
  formatAccountRestrictionDeadline,
  resolvedAccountRestrictionFromRow,
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

  it("office lift only for office source", () => {
    expect(accountRestrictionOfficeCanLift("grid")).toBe(false)
    expect(accountRestrictionOfficeCanLift("noah")).toBe(false)
    expect(accountRestrictionOfficeCanLift("office")).toBe(true)
  })

  it("review window is 7 days", () => {
    expect(ACCOUNT_RESTRICTION_WIND_DOWN_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it("locked copy points to contact support", () => {
    expect(accountRestrictionLockedCopy()).toBe(
      "Your account has been suspended. Contact support if you have questions.",
    )
  })

  it("maps restriction rows including lifts", () => {
    expect(
      resolvedAccountRestrictionFromRow({
        subject_kind: "business",
        restricted_at: "2026-09-02T10:00:00.000Z",
        wind_down_ends_at: "2026-09-09T10:00:00.000Z",
        locked_at: null,
        lifted_at: null,
        source: "office",
        reason: "Office hold",
      }),
    ).toMatchObject({ active: true, phase: "wind_down", source: "office" })

    expect(
      resolvedAccountRestrictionFromRow({
        subject_kind: "user",
        restricted_at: "2026-09-02T10:00:00.000Z",
        wind_down_ends_at: "2026-09-09T10:00:00.000Z",
        locked_at: "2026-09-09T10:00:00.000Z",
        lifted_at: null,
        source: "grid",
      }),
    ).toMatchObject({ active: true, phase: "locked", source: "grid" })

    expect(
      resolvedAccountRestrictionFromRow({
        subject_kind: "user",
        restricted_at: "2026-09-02T10:00:00.000Z",
        wind_down_ends_at: "2026-09-09T10:00:00.000Z",
        lifted_at: "2026-09-03T10:00:00.000Z",
        source: "office",
      }),
    ).toMatchObject({ active: false, phase: "none" })
  })
})

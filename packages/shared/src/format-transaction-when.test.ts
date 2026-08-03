import { describe, expect, it } from "vitest"
import { formatTransactionWhen } from "./format-transaction-when"

describe("formatTransactionWhen", () => {
  it("formats device-local time without relying on Intl.formatToParts", () => {
    expect(formatTransactionWhen(new Date(2026, 7, 3, 4, 54))).toBe(
      "Aug 03, 2026 • 4:54 AM",
    )
  })

  it("uses the canonical abbreviated date, bullet, and 12-hour time", () => {
    expect(
      formatTransactionWhen("2026-08-03T04:54:00.000Z", { timeZone: "UTC" }),
    ).toBe("Aug 03, 2026 • 4:54 AM")
  })

  it("returns an empty string for invalid input", () => {
    expect(formatTransactionWhen("not-a-date")).toBe("")
  })
})

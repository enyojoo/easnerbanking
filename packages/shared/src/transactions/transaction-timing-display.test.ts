import { describe, expect, it } from "vitest"
import {
  buildTransactionTimingRows,
  formatTransactionDurationMs,
} from "./transaction-timing-display"

describe("formatTransactionDurationMs", () => {
  it("formats sub-minute durations in seconds", () => {
    expect(formatTransactionDurationMs(12_000)).toBe("12 seconds")
    expect(formatTransactionDurationMs(1000)).toBe("1 second")
  })

  it("formats minutes and hours with approximate prefix for hours", () => {
    expect(formatTransactionDurationMs(120_000)).toBe("2 minutes")
    expect(formatTransactionDurationMs(3_600_000)).toBe("~1 hour")
  })
})

describe("buildTransactionTimingRows", () => {
  const started = "2026-06-01T15:00:00.000Z"
  const completed = "2026-06-01T15:00:12.000Z"

  it("returns Expected and Started while pending for global payout", () => {
    const rows = buildTransactionTimingRows({
      status: "pending",
      startedAt: started,
      expectedProcessingTime: "Within minutes",
      showExpectedWhileInFlight: true,
    })
    expect(rows).toEqual([
      { label: "Expected", value: "Within minutes" },
      { label: "Started", value: expect.stringContaining("Jun") },
    ])
  })

  it("returns Started only while pending for bank deposit", () => {
    const rows = buildTransactionTimingRows({
      status: "processing",
      startedAt: started,
      showExpectedWhileInFlight: false,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe("Started")
  })

  it("returns Completed in when settled with both timestamps", () => {
    const rows = buildTransactionTimingRows({
      status: "settled",
      startedAt: started,
      completedAt: completed,
    })
    expect(rows).toEqual([{ label: "Completed in", value: "12 seconds" }])
  })

  it("returns Failed after when failed with end time", () => {
    const rows = buildTransactionTimingRows({
      status: "failed",
      startedAt: started,
      failedAt: "2026-06-01T15:03:00.000Z",
    })
    expect(rows[0]).toEqual({ label: "Failed after", value: "3 minutes" })
  })

  it("falls back to Started when settled without completed_at", () => {
    const rows = buildTransactionTimingRows({
      status: "settled",
      startedAt: started,
      completedAt: null,
    })
    expect(rows[0].label).toBe("Started")
  })
})

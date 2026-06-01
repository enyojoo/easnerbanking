import { describe, expect, it } from "vitest"
import {
  buildTransactionTimingRows,
  formatTransactionDurationMs,
  resolveTransactionTimingAnchors,
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
      showStartedWhileInFlight: true,
    })
    expect(rows).toEqual([
      { label: "Expected", value: "Within minutes" },
      { label: "Started", value: expect.stringContaining("Jun") },
    ])
  })

  it("returns no summary rows while deposit is in-flight", () => {
    const rows = buildTransactionTimingRows({
      status: "processing",
      startedAt: started,
      showExpectedWhileInFlight: false,
      showStartedWhileInFlight: false,
    })
    expect(rows).toEqual([])
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

  it("returns nothing when settled without completed_at", () => {
    const rows = buildTransactionTimingRows({
      status: "settled",
      startedAt: started,
      completedAt: null,
    })
    expect(rows).toEqual([])
  })
})

describe("resolveTransactionTimingAnchors", () => {
  it("uses created_at as start and prefers webhook completed over stale metadata", () => {
    const anchors = resolveTransactionTimingAnchors({
      createdAt: "2026-06-01T15:00:00.000Z",
      metadata: { completed_at: "2026-06-01T14:00:00.000Z" },
      webhookCompletedAt: "2026-06-01T15:00:12.000Z",
    })
    expect(anchors.startedAt).toBe("2026-06-01T15:00:00.000Z")
    expect(anchors.completedAt).toBe("2026-06-01T15:00:12.000Z")
    const rows = buildTransactionTimingRows({
      status: "settled",
      startedAt: anchors.startedAt,
      completedAt: anchors.completedAt,
    })
    expect(rows[0]).toEqual({ label: "Completed in", value: "12 seconds" })
  })

  it("uses processing_at as deposit duration start", () => {
    const anchors = resolveTransactionTimingAnchors({
      startAnchor: "processing_at",
      createdAt: "2026-06-01T14:00:00.000Z",
      metadata: { processing_at: "2026-06-01T15:00:00.000Z" },
      webhookCompletedAt: "2026-06-01T15:00:45.000Z",
    })
    expect(anchors.startedAt).toBe("2026-06-01T15:00:00.000Z")
    expect(anchors.completedAt).toBe("2026-06-01T15:00:45.000Z")
    const rows = buildTransactionTimingRows({
      status: "settled",
      startedAt: anchors.startedAt,
      completedAt: anchors.completedAt,
      showStartedWhileInFlight: false,
    })
    expect(rows[0]).toEqual({ label: "Completed in", value: "45 seconds" })
  })

  it("prefers webhook failed_at for failed duration", () => {
    const anchors = resolveTransactionTimingAnchors({
      createdAt: "2026-06-01T15:00:00.000Z",
      metadata: { failed_at: "2026-06-01T14:00:00.000Z" },
      webhookFailedAt: "2026-06-01T15:02:00.000Z",
    })
    expect(anchors.failedAt).toBe("2026-06-01T15:02:00.000Z")
    const rows = buildTransactionTimingRows({
      status: "failed",
      startedAt: anchors.startedAt,
      failedAt: anchors.failedAt,
    })
    expect(rows[0]).toEqual({ label: "Failed after", value: "2 minutes" })
  })
})

import { describe, expect, it } from "vitest"
import { resolveBusinessHeadlineKybStatus } from "./business-tier1"

const T1 = "2026-09-01T12:00:00.000Z"
const T2 = "2026-09-10T12:00:00.000Z"

describe("resolveBusinessHeadlineKybStatus", () => {
  it("returns not_started when both rails are idle", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "not_started",
        bridgeStatus: null,
      }),
    ).toBe("not_started")
  })

  it("uses approved when the other rail is idle", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "approved",
        bridgeStatus: "not_started",
        gridUpdatedAt: T1,
      }),
    ).toBe("approved")
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "not_started",
        bridgeStatus: "approved",
        bridgeUpdatedAt: T1,
      }),
    ).toBe("approved")
  })

  it("lets a later status on the other rail lead even if one is approved", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "approved",
        bridgeStatus: "in_progress",
        gridUpdatedAt: T1,
        bridgeUpdatedAt: T2,
      }),
    ).toBe("in_progress")
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "rejected",
        bridgeStatus: "approved",
        gridUpdatedAt: T2,
        bridgeUpdatedAt: T1,
      }),
    ).toBe("rejected")
  })

  it("keeps approved when the other rail changed earlier", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "approved",
        bridgeStatus: "in_progress",
        gridUpdatedAt: T2,
        bridgeUpdatedAt: T1,
      }),
    ).toBe("approved")
  })

  it("uses the last-changed rail when neither is approved", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "rejected",
        bridgeStatus: "pending",
        gridUpdatedAt: T1,
        bridgeUpdatedAt: T2,
      }),
    ).toBe("pending")
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "hold",
        bridgeStatus: "pending",
        gridUpdatedAt: T2,
        bridgeUpdatedAt: T1,
      }),
    ).toBe("hold")
  })

  it("prefers Bridge when Grid is rejected and Bridge has started without timestamps", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "rejected",
        bridgeStatus: "pending",
      }),
    ).toBe("pending")
  })

  it("uses Grid rejected when Bridge is still idle", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "rejected",
        bridgeStatus: "not_started",
      }),
    ).toBe("rejected")
  })

  it("treats a dated other-rail change as newer when approval has no timestamp", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "approved",
        bridgeStatus: "in_progress",
        bridgeUpdatedAt: T2,
      }),
    ).toBe("in_progress")
  })

  it("keeps dated approval when the other rail has no timestamp", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "approved",
        bridgeStatus: "in_progress",
        gridUpdatedAt: T1,
      }),
    ).toBe("approved")
  })

  it("uses the progressed non-approved rail on legacy rows with no timestamps", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "approved",
        bridgeStatus: "in_progress",
      }),
    ).toBe("in_progress")
  })

  it("stays approved when both rails are approved", () => {
    expect(
      resolveBusinessHeadlineKybStatus({
        gridStatus: "approved",
        bridgeStatus: "approved",
        gridUpdatedAt: T1,
        bridgeUpdatedAt: T2,
      }),
    ).toBe("approved")
  })
})

import { describe, expect, it } from "vitest"
import { buildGlobalPayoutLifecycle } from "./global-payout-lifecycle"

describe("buildGlobalPayoutLifecycle", () => {
  it("does not fall back to createdAt for processing step timestamp", () => {
    const steps = buildGlobalPayoutLifecycle({
      status: "pending",
      metadata: {},
      createdAt: "2026-06-01T15:00:00.000Z",
      occurredAt: "2026-06-01T15:00:01.000Z",
    })
    expect(steps[0].occurredAt).toBeNull()
  })

  it("uses processing_at from metadata for processing step", () => {
    const steps = buildGlobalPayoutLifecycle({
      status: "pending",
      metadata: { processing_at: "2026-06-01T15:01:00.000Z" },
      createdAt: "2026-06-01T15:00:00.000Z",
    })
    expect(steps[0].occurredAt).toBe("2026-06-01T15:01:00.000Z")
  })

  it("does not fall back to processingAt for failed step when failed_at is missing", () => {
    const steps = buildGlobalPayoutLifecycle({
      status: "failed",
      metadata: { processing_at: "2026-06-01T15:01:00.000Z" },
    })
    expect(steps[1].occurredAt).toBeNull()
  })

  it("uses failed_at for failed step timestamp", () => {
    const steps = buildGlobalPayoutLifecycle({
      status: "failed",
      metadata: {
        processing_at: "2026-06-01T15:01:00.000Z",
        failed_at: "2026-06-01T15:05:00.000Z",
      },
    })
    expect(steps[1].occurredAt).toBe("2026-06-01T15:05:00.000Z")
  })
})

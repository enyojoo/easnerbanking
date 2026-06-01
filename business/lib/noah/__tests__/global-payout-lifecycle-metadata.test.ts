import { describe, expect, it } from "vitest"
import { mergeGlobalPayoutLifecycleMetadata } from "../bank-onramp-tx"

describe("mergeGlobalPayoutLifecycleMetadata", () => {
  it("preserves transaction_started_at once set", () => {
    const merged = mergeGlobalPayoutLifecycleMetadata(
      { transaction_started_at: "2026-06-01T10:00:00Z" },
      { transaction_started_at: "2026-06-01T11:00:00Z" },
    )
    expect(merged.transaction_started_at).toBe("2026-06-01T10:00:00Z")
  })

  it("first completed_at wins", () => {
    const merged = mergeGlobalPayoutLifecycleMetadata(
      { completed_at: "2026-06-01T10:00:10Z" },
      { completed_at: "2026-06-01T10:00:20Z" },
    )
    expect(merged.completed_at).toBe("2026-06-01T10:00:10Z")
  })

  it("sets failed_at and aliases noah_payout_failed_at", () => {
    const merged = mergeGlobalPayoutLifecycleMetadata({}, {
      failed_at: "2026-06-01T10:05:00Z",
    })
    expect(merged.failed_at).toBe("2026-06-01T10:05:00Z")
    expect(merged.noah_payout_failed_at).toBe("2026-06-01T10:05:00Z")
  })
})

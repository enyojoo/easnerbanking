import { describe, expect, it } from "vitest"
import { evaluateVelocityTrigger } from "@easner/shared"

/**
 * Documents the production velocity trigger thresholds wired in wallet-send-compliance.
 * If these change in packages/shared, update this test and the Grid partner note.
 */
describe("wallet send velocity trigger contract", () => {
  const now = Date.parse("2026-09-01T18:00:00.000Z")

  it("does not trigger below single-inbound threshold", () => {
    const result = evaluateVelocityTrigger(
      [{ amountUsd: 9_999, creditedAt: "2026-09-01T17:00:00.000Z" }],
      now,
    )
    expect(result.triggered).toBe(false)
  })

  it("triggers on single inbound at $10k with 20% outbound cap", () => {
    const result = evaluateVelocityTrigger(
      [{ amountUsd: 10_000, creditedAt: "2026-09-01T17:00:00.000Z" }],
      now,
    )
    expect(result.triggered).toBe(true)
    expect(result.reason).toBe("single_inbound_10k")
    expect(result.maxSendUsd).toBe(2_000)
    expect(result.capPct).toBe(20)
  })

  it("triggers on 48h aggregate without a single $10k leg", () => {
    const result = evaluateVelocityTrigger(
      [
        { amountUsd: 4_000, creditedAt: "2026-08-31T20:00:00.000Z" },
        { amountUsd: 6_000, creditedAt: "2026-09-01T12:00:00.000Z" },
      ],
      now,
    )
    expect(result.triggered).toBe(true)
    expect(result.reason).toBe("aggregate_48h_10k")
  })

  it("triggers on same-day structuring pattern", () => {
    const result = evaluateVelocityTrigger(
      [
        { amountUsd: 2_000, creditedAt: "2026-09-01T10:00:00.000Z" },
        { amountUsd: 2_000, creditedAt: "2026-09-01T12:00:00.000Z" },
        { amountUsd: 1_500, creditedAt: "2026-09-01T14:00:00.000Z" },
      ],
      now,
    )
    expect(result.triggered).toBe(true)
    expect(result.reason).toBe("structuring_same_day")
  })
})

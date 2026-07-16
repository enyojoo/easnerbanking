import { describe, expect, it } from "vitest"
import { ledgerOccurredAtForNewRow, resolveLedgerOccurredAt } from "./ledger-occurred-at"

describe("ledger occurred_at helpers", () => {
  it("uses existing occurred_at when present", () => {
    expect(
      resolveLedgerOccurredAt({
        occurredAt: "2026-07-16T09:00:00.000Z",
        createdAt: "2026-07-16T08:00:00.000Z",
      }),
    ).toBe("2026-07-16T09:00:00.000Z")
  })

  it("falls back to created_at when occurred_at is missing", () => {
    expect(
      resolveLedgerOccurredAt({
        occurredAt: null,
        createdAt: "2026-07-16T09:03:48.384Z",
      }),
    ).toBe("2026-07-16T09:03:48.384Z")
  })

  it("returns ISO string for new rows", () => {
    const at = ledgerOccurredAtForNewRow(new Date("2026-07-16T09:03:48.384Z"))
    expect(at).toBe("2026-07-16T09:03:48.384Z")
  })
})

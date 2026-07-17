import { describe, expect, it } from "vitest"
import {
  buildNextLedgerListCursor,
  decodeLedgerListCursor,
  encodeLedgerListCursor,
  resolveHiddenFromFeed,
} from "../ledger-list-cursor"

describe("ledger list cursor", () => {
  it("round-trips cursor encoding", () => {
    const cursor = {
      created_at: "2025-01-15T12:00:00.000Z",
      id: "tx-1",
    }
    const encoded = encodeLedgerListCursor(cursor)
    expect(decodeLedgerListCursor(encoded)).toEqual(cursor)
  })

  it("builds next cursor when more rows exist", () => {
    const rows = [
      { id: "a", created_at: "2025-01-02T00:00:00.000Z" },
      { id: "b", created_at: "2025-01-01T00:00:00.000Z" },
    ]
    const { visible, nextCursor } = buildNextLedgerListCursor(rows, 1)
    expect(visible).toHaveLength(1)
    expect(nextCursor).toBeTruthy()
    expect(decodeLedgerListCursor(nextCursor)?.id).toBe("a")
  })

  it("returns null next cursor on final page", () => {
    const rows = [{ id: "a", created_at: "2025-01-01T00:00:00.000Z" }]
    const { nextCursor } = buildNextLedgerListCursor(rows, 50)
    expect(nextCursor).toBeNull()
  })
})

describe("resolveHiddenFromFeed", () => {
  it("hides orchestration and mirror legs", () => {
    expect(resolveHiddenFromFeed({ suppress_in_feed: true })).toBe(true)
    expect(resolveHiddenFromFeed({ noah_bank_onramp_chain_mirror: true })).toBe(true)
    expect(resolveHiddenFromFeed({ global_payout_refund_mirror: true })).toBe(true)
    expect(resolveHiddenFromFeed({ sender_name: "Acme" })).toBe(false)
  })
})

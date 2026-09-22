import { describe, expect, it } from "vitest"
import { applyLedgerListCreatedAtRange, parseLedgerListIsoBound } from "./ledger-list-range"

describe("parseLedgerListIsoBound", () => {
  it("accepts a valid instant and rejects junk", () => {
    expect(parseLedgerListIsoBound("2026-09-01T00:00:00.000Z")).toBe("2026-09-01T00:00:00.000Z")
    expect(parseLedgerListIsoBound("not-a-date")).toBeNull()
    expect(parseLedgerListIsoBound("")).toBeNull()
  })
})

describe("applyLedgerListCreatedAtRange", () => {
  it("applies inclusive created_at bounds", () => {
    const calls: Array<[string, string, string]> = []
    const query = {
      gte(column: string, value: string) {
        calls.push(["gte", column, value])
        return this
      },
      lte(column: string, value: string) {
        calls.push(["lte", column, value])
        return this
      },
    }
    applyLedgerListCreatedAtRange(query, "2026-09-01T00:00:00.000Z", "2026-09-08T12:00:00.000Z")
    expect(calls).toEqual([
      ["gte", "created_at", "2026-09-01T00:00:00.000Z"],
      ["lte", "created_at", "2026-09-08T12:00:00.000Z"],
    ])
  })
})

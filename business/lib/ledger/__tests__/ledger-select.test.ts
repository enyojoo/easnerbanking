import { describe, expect, it } from "vitest"
import {
  LEDGER_DETAIL_SELECT,
  LEDGER_LIST_SELECT,
  OFFICE_LEDGER_DETAIL_SELECT,
  OFFICE_LEDGER_LIST_SELECT,
} from "../ledger-select"

function columnNames(select: string): string[] {
  return select.split(",").map((c) => c.trim())
}

describe("ledger select constants", () => {
  it("list select omits payload", () => {
    expect(columnNames(LEDGER_LIST_SELECT)).not.toContain("payload")
    expect(columnNames(LEDGER_LIST_SELECT)).toContain("metadata")
    expect(columnNames(LEDGER_LIST_SELECT)).toContain("hidden_from_feed")
  })

  it("detail select includes payload", () => {
    expect(columnNames(LEDGER_DETAIL_SELECT)).toContain("payload")
    expect(columnNames(LEDGER_DETAIL_SELECT)).toContain("hidden_from_feed")
  })

  it("office list select omits payload", () => {
    expect(columnNames(OFFICE_LEDGER_LIST_SELECT)).not.toContain("payload")
    expect(columnNames(OFFICE_LEDGER_LIST_SELECT)).toContain("hidden_from_feed")
  })

  it("office detail select includes payload and scope columns", () => {
    expect(columnNames(OFFICE_LEDGER_DETAIL_SELECT)).toContain("payload")
    expect(columnNames(OFFICE_LEDGER_DETAIL_SELECT)).toContain("user_id")
    expect(columnNames(OFFICE_LEDGER_DETAIL_SELECT)).toContain("business_id")
    expect(columnNames(OFFICE_LEDGER_DETAIL_SELECT)).toContain("provider_event_id")
  })
})

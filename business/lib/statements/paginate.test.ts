import { describe, expect, it } from "vitest"
import { chunkStatementActivityPages } from "./paginate"
import type { StatementActivityPdfRow } from "./types"

function row(i: number): StatementActivityPdfRow {
  return {
    date: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
    type: "Transfer",
    details: `Row ${i}`,
    moneyIn: "",
    moneyOut: "$1",
  }
}

describe("chunkStatementActivityPages", () => {
  it("keeps an empty statement on a single page", () => {
    expect(chunkStatementActivityPages([])).toEqual([[]])
  })

  it("puts the first 16 rows on page 1 and the rest on later pages", () => {
    const lines = Array.from({ length: 33 }, (_, i) => row(i))
    const pages = chunkStatementActivityPages(lines)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toHaveLength(16)
    expect(pages[1]).toHaveLength(17)
    expect(pages[0][0]?.details).toBe("Row 0")
    expect(pages[1][0]?.details).toBe("Row 16")
  })
})

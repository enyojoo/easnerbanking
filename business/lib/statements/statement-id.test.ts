import { describe, expect, it } from "vitest"
import { generateStatementId, isStatementIdFormat } from "./statement-id"

describe("statement id", () => {
  it("matches EST-YYYYMMDD-XXXX", () => {
    const id = generateStatementId(new Date("2026-08-29T12:00:00.000Z"))
    expect(id).toMatch(/^EST-20260829-[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(isStatementIdFormat(id)).toBe(true)
    expect(isStatementIdFormat("EST-20260829-A3K9")).toBe(true)
    expect(isStatementIdFormat("EST-20260829-IIII")).toBe(false)
  })
})

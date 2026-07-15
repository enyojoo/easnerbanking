import { describe, expect, it } from "vitest"
import { hasHistoricalBaseCurrencyMismatch } from "./base-currency-display"

describe("base-currency-display", () => {
  it("detects rows recorded under a different base currency", () => {
    const rows = [
      { baseCurrency: "USD", amount: 10, direction: "credit" as const, date: "", description: "", type: "book" as const, source: "account" as const, status: "completed", id: "1" },
      { baseCurrency: "EUR", amount: 5, direction: "debit" as const, date: "", description: "", type: "book" as const, source: "account" as const, status: "completed", id: "2" },
    ]
    expect(hasHistoricalBaseCurrencyMismatch(rows, "GBP")).toBe(true)
    expect(hasHistoricalBaseCurrencyMismatch(rows, "USD")).toBe(true)
  })

  it("returns false when all rows match current base", () => {
    const rows = [
      { baseCurrency: "EUR", amount: 5, direction: "debit" as const, date: "", description: "", type: "book" as const, source: "account" as const, status: "completed", id: "1" },
    ]
    expect(hasHistoricalBaseCurrencyMismatch(rows, "EUR")).toBe(false)
  })
})

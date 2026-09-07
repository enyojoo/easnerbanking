import { describe, expect, it } from "vitest"
import { splitStatementLedger } from "./summary"

const START = Date.parse("2026-08-17T00:00:00.000Z")
const END = Date.parse("2026-09-07T23:59:59.999Z")

function row(when: string, direction: "in" | "out", amount: number) {
  return {
    occurred_at: when,
    direction,
    amount,
    currency: "USD",
    metadata: { reporting_wallet_amount: amount, reporting_wallet_currency: "USD" },
  }
}

function split(ledger: Record<string, unknown>[]) {
  return splitStatementLedger({
    ledger,
    currency: "USD" as const,
    periodStartMs: START,
    periodEndMs: END,
  })
}

describe("splitStatementLedger", () => {
  it("measures opening from activity before the period", () => {
    const { summary } = split([
      row("2026-07-01T10:00:00.000Z", "in", 500),
      row("2026-07-20T10:00:00.000Z", "out", 200),
      row("2026-08-20T10:00:00.000Z", "in", 100),
      row("2026-08-21T10:00:00.000Z", "out", 40),
    ])
    expect(summary).toEqual({ opening: 300, moneyIn: 100, moneyOut: 40, closing: 360 })
  })

  it("opens at zero when the whole history falls inside the period", () => {
    const { summary } = split([
      row("2026-08-18T10:00:00.000Z", "in", 2351.16),
      row("2026-08-19T10:00:00.000Z", "out", 699.52),
    ])
    expect(summary.opening).toBe(0)
    expect(summary.closing).toBe(1651.64)
  })

  it("excludes activity after the period from both the summary and the lines", () => {
    const { summary, inPeriod } = split([
      row("2026-08-18T10:00:00.000Z", "in", 100),
      row("2026-09-30T10:00:00.000Z", "in", 999),
    ])
    expect(summary).toEqual({ opening: 0, moneyIn: 100, moneyOut: 0, closing: 100 })
    expect(inPeriod).toHaveLength(1)
  })

  it("keeps closing equal to opening plus the period's flows", () => {
    const { summary } = split([
      row("2026-01-05T10:00:00.000Z", "in", 12.34),
      row("2026-08-18T10:00:00.000Z", "in", 0.055),
      row("2026-08-19T10:00:00.000Z", "out", 0.015),
    ])
    expect(summary.closing).toBe(
      Math.round((summary.opening + summary.moneyIn - summary.moneyOut) * 100) / 100,
    )
  })

  it("returns the period rows oldest first with their instants", () => {
    const { inPeriod } = split([
      row("2026-08-18T10:00:00.000Z", "in", 1),
      row("2026-08-25T10:00:00.000Z", "out", 2),
    ])
    expect(inPeriod.map((r) => r.at.toISOString())).toEqual([
      "2026-08-18T10:00:00.000Z",
      "2026-08-25T10:00:00.000Z",
    ])
  })

  it("skips rows whose impact is not in the statement currency", () => {
    const { summary, inPeriod } = split([
      row("2026-08-18T10:00:00.000Z", "in", 50),
      {
        occurred_at: "2026-08-19T10:00:00.000Z",
        direction: "out",
        amount: 260_000,
        currency: "NGN",
        base_amount: 260_000,
        base_currency: "NGN",
        metadata: {},
      },
    ])
    expect(summary).toEqual({ opening: 0, moneyIn: 50, moneyOut: 0, closing: 50 })
    // Still listed, so the statement shows the movement even when it cannot value it.
    expect(inPeriod).toHaveLength(2)
  })

  it("ignores rows with an unparseable timestamp", () => {
    const { summary, inPeriod } = split([
      { occurred_at: "not-a-date", direction: "in", amount: 10, currency: "USD", metadata: {} },
      row("2026-08-18T10:00:00.000Z", "in", 5),
    ])
    expect(summary.moneyIn).toBe(5)
    expect(inPeriod).toHaveLength(1)
  })
})

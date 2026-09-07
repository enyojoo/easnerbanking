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
  it("excludes activity before the period from the flows", () => {
    const { summary, inPeriod } = split([
      row("2026-07-01T10:00:00.000Z", "in", 500),
      row("2026-07-20T10:00:00.000Z", "out", 200),
      row("2026-08-20T10:00:00.000Z", "in", 100),
      row("2026-08-21T10:00:00.000Z", "out", 40),
    ])
    expect(summary).toEqual({ moneyIn: 100, moneyOut: 40 })
    expect(inPeriod).toHaveLength(2)
  })

  it("sums the period's flows", () => {
    const { summary } = split([
      row("2026-08-18T10:00:00.000Z", "in", 2351.16),
      row("2026-08-19T10:00:00.000Z", "out", 699.52),
    ])
    expect(summary).toEqual({ moneyIn: 2351.16, moneyOut: 699.52 })
  })

  it("excludes activity after the period from both the summary and the lines", () => {
    const { summary, inPeriod } = split([
      row("2026-08-18T10:00:00.000Z", "in", 100),
      row("2026-09-30T10:00:00.000Z", "in", 999),
    ])
    expect(summary).toEqual({ moneyIn: 100, moneyOut: 0 })
    expect(inPeriod).toHaveLength(1)
  })

  it("rounds the flows to cents", () => {
    const { summary } = split([
      row("2026-08-18T10:00:00.000Z", "in", 0.055),
      row("2026-08-19T10:00:00.000Z", "out", 0.015),
    ])
    expect(summary).toEqual({ moneyIn: 0.06, moneyOut: 0.02 })
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
    expect(summary).toEqual({ moneyIn: 50, moneyOut: 0 })
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

import { describe, expect, it } from "vitest"
import { sumIncomingBalances } from "./incoming-balances"

describe("sumIncomingBalances", () => {
  it("sums unsettled rows by currency in major units", () => {
    expect(
      sumIncomingBalances(
        [
          { currency: "usd", net_cents: 100_00, ledger_transaction_id: "tx-1" },
          { currency: "USD", net_cents: 50_00, ledger_transaction_id: "tx-2" },
        ],
        new Set(["tx-1", "tx-2"]),
      ),
    ).toEqual({ USD: 150 })
  })

  it("ignores settlements whose ledger transaction was deleted", () => {
    expect(
      sumIncomingBalances(
        [
          { currency: "USD", net_cents: 56_888_00, ledger_transaction_id: "gone-1" },
          { currency: "USD", net_cents: 10_00, ledger_transaction_id: "live-1" },
        ],
        new Set(["live-1"]),
      ),
    ).toEqual({ USD: 10 })
  })

  it("keeps settlements without a ledger link", () => {
    expect(
      sumIncomingBalances(
        [{ currency: "EUR", net_cents: 25_00, ledger_transaction_id: null }],
        new Set(),
      ),
    ).toEqual({ EUR: 25 })
  })
})

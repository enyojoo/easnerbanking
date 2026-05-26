import { describe, expect, it } from "vitest"
import {
  ledgerStatusMatchesUserFilter,
  ledgerTransactionStatusDisplay,
  mapLedgerStatusToUserStatus,
} from "./ledger-status-display"

describe("mapLedgerStatusToUserStatus", () => {
  it("maps Noah settled to completed filter key", () => {
    expect(mapLedgerStatusToUserStatus("settled")).toBe("completed")
    expect(mapLedgerStatusToUserStatus("Settled")).toBe("completed")
  })

  it("maps unknown to pending", () => {
    expect(mapLedgerStatusToUserStatus("unknown")).toBe("pending")
  })

  it("maps cancelled to failed filter key", () => {
    expect(mapLedgerStatusToUserStatus("cancelled")).toBe("failed")
  })
})

describe("ledgerTransactionStatusDisplay", () => {
  it("shows Completed for settled ledger rows", () => {
    expect(ledgerTransactionStatusDisplay("settled")).toEqual({
      label: "Completed",
      tone: "completed",
    })
  })

  it("shows Processing for pending ledger rows", () => {
    expect(ledgerTransactionStatusDisplay("pending")).toEqual({
      label: "Pending",
      tone: "pending",
    })
  })
})

describe("ledgerStatusMatchesUserFilter", () => {
  it("matches settled rows under completed filter", () => {
    expect(ledgerStatusMatchesUserFilter("settled", "completed")).toBe(true)
    expect(ledgerStatusMatchesUserFilter("settled", "processing")).toBe(false)
  })
})

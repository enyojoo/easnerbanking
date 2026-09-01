import { describe, expect, it } from "vitest"
import {
  isSuccessfulTransactionStatus,
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

describe("isSuccessfulTransactionStatus", () => {
  it("counts settled, deposited, and confirmed as successful", () => {
    expect(isSuccessfulTransactionStatus("settled")).toBe(true)
    expect(isSuccessfulTransactionStatus("completed")).toBe(true)
    expect(isSuccessfulTransactionStatus("deposited")).toBe(true)
    expect(isSuccessfulTransactionStatus("confirmed")).toBe(true)
    expect(isSuccessfulTransactionStatus("Confirmed")).toBe(true)
  })

  it("excludes pending, processing, and failed", () => {
    expect(isSuccessfulTransactionStatus("pending")).toBe(false)
    expect(isSuccessfulTransactionStatus("processing")).toBe(false)
    expect(isSuccessfulTransactionStatus("processing_payment")).toBe(false)
    expect(isSuccessfulTransactionStatus("failed")).toBe(false)
    expect(isSuccessfulTransactionStatus("cancelled")).toBe(false)
    expect(isSuccessfulTransactionStatus("canceled")).toBe(false)
  })
})

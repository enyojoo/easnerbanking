import { describe, expect, it } from "vitest"
import {
  resolveTransactionDetailReturnPath,
  transactionWebDetailPath,
} from "./easner-transaction-id"

describe("transactionWebDetailPath", () => {
  it("appends returnTo query for YC pay-in exits", () => {
    expect(transactionWebDetailPath("ETID55613389", { returnTo: "dashboard" })).toBe(
      "/transactions/etid55613389?returnTo=dashboard",
    )
  })
})

describe("resolveTransactionDetailReturnPath", () => {
  it("maps returnTo to dashboard or transactions", () => {
    expect(resolveTransactionDetailReturnPath("dashboard")).toBe("/dashboard")
    expect(resolveTransactionDetailReturnPath("transactions")).toBe("/transactions")
    expect(resolveTransactionDetailReturnPath(null)).toBeNull()
  })
})

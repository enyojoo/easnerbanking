import { describe, expect, it, afterEach } from "vitest"
import { isLedgerTransactionEmailEnabled } from "./email-rollout"

describe("isLedgerTransactionEmailEnabled", () => {
  const prev = process.env.LEDGER_TRANSACTION_EMAIL_ENABLED

  afterEach(() => {
    if (prev === undefined) delete process.env.LEDGER_TRANSACTION_EMAIL_ENABLED
    else process.env.LEDGER_TRANSACTION_EMAIL_ENABLED = prev
  })

  it("is on when env is unset", () => {
    delete process.env.LEDGER_TRANSACTION_EMAIL_ENABLED
    expect(isLedgerTransactionEmailEnabled()).toBe(true)
  })

  it("is off only when explicitly disabled", () => {
    process.env.LEDGER_TRANSACTION_EMAIL_ENABLED = "false"
    expect(isLedgerTransactionEmailEnabled()).toBe(false)
    process.env.LEDGER_TRANSACTION_EMAIL_ENABLED = "off"
    expect(isLedgerTransactionEmailEnabled()).toBe(false)
  })
})

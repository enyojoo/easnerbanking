import { describe, expect, it } from "vitest"
import { sanitizeCustomerFacingFailureReason } from "./sanitize-customer-facing-failure-reason"

describe("sanitizeCustomerFacingFailureReason", () => {
  it("drops Grid/Noah machine codes", () => {
    expect(sanitizeCustomerFacingFailureReason("QUOTE_EXECUTION_FAILED")).toBeUndefined()
    expect(sanitizeCustomerFacingFailureReason("FAILED")).toBeUndefined()
    expect(sanitizeCustomerFacingFailureReason("wallet_debit_failed")).toBeUndefined()
    expect(sanitizeCustomerFacingFailureReason("insufficient_balance")).toBeUndefined()
  })

  it("keeps human-readable bank rejection copy", () => {
    expect(sanitizeCustomerFacingFailureReason("Recipient bank rejected the transfer.")).toBe(
      "Recipient bank rejected the transfer.",
    )
  })
})

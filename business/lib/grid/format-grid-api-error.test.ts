import { describe, expect, it } from "vitest"
import { formatHostedKybStartError, mapGridPayoutQuoteUserError } from "./format-grid-api-error"
import { GridHttpError } from "./http"

describe("mapGridPayoutQuoteUserError", () => {
  it("maps China Thunes B2C bank failures to business-recipient guidance", () => {
    expect(
      mapGridPayoutQuoteUserError(
        new Error("No Thunes payer found for currency=CNY, service_type=BankAccount, transaction_type=B2C"),
      ),
    ).toMatch(/business recipient/i)
  })
})

describe("formatHostedKybStartError", () => {
  it("maps Grid document screening failures to ID photo guidance", () => {
    expect(
      formatHostedKybStartError(
        new GridHttpError("DOCUMENT_REJECTED", 422, { code: "DOCUMENT_REJECTED" }, "POST", "/documents"),
      ),
    ).toMatch(/photograph the physical/i)
    expect(
      formatHostedKybStartError(
        new GridHttpError("The document is unreadable", 400, { message: "The document is unreadable" }),
      ),
    ).toMatch(/photograph the physical/i)
  })

  it("maps generic start failures to an actionable retry instead of Grid's support line", () => {
    expect(
      formatHostedKybStartError(
        new GridHttpError("Verification could not be started. Contact support if this persists.", 400, {
          message: "Verification could not be started. Contact support if this persists.",
        }),
      ),
    ).toMatch(/date of birth/i)
  })

  it("maps timeouts to a retry without asking for a re-upload", () => {
    const timeout = new Error("The operation was aborted due to timeout")
    timeout.name = "TimeoutError"
    expect(formatHostedKybStartError(timeout)).toMatch(/try again/i)
  })
})

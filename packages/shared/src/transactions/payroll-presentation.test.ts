import { describe, expect, it } from "vitest"
import { resolveInboundTransactionListLabel } from "./transaction-list-label"
import { deriveTransactionNotification } from "./derive-transaction-notification"

describe("payroll transaction presentation", () => {
  const metadata = {
    product: "payroll",
    payroll_business_name: "Acme Ltd",
  }

  it("shows the employer in transaction lists", () => {
    expect(resolveInboundTransactionListLabel({ metadata }))
      .toBe("Payment from Acme Ltd")
  })

  it("uses payroll-specific push copy and category", () => {
    const result = deriveTransactionNotification({
      provider: "easner_internal",
      direction: "in",
      amount: 2500,
      currency: "USD",
      metadata,
    })
    expect(result.pushTitle).toBe("Payroll payment received")
    expect(result.emailSubject).toBe("Payroll payment received")
    expect(result.category).toBe("Payroll payment")
  })
})

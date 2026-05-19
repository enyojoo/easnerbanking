import { describe, expect, it } from "vitest"
import {
  buildBankDepositLifecycle,
  formatBankDepositPostedAmount,
} from "./bank-deposit-lifecycle"

describe("formatBankDepositPostedAmount", () => {
  it("formats USD with two decimals", () => {
    expect(formatBankDepositPostedAmount(9.946, "USD")).toBe("$9.95")
  })
})

describe("buildBankDepositLifecycle", () => {
  it("returns processing current and completed upcoming when pending", () => {
    const steps = buildBankDepositLifecycle({
      status: "pending",
      metadata: {
        processing_at: "2026-05-19T22:00:46Z",
        settled_amount: 9.95,
        settled_currency: "USD",
      },
      createdAt: "2026-05-19T22:00:53Z",
    })
    expect(steps).toHaveLength(2)
    expect(steps[0].id).toBe("processing")
    expect(steps[0].state).toBe("current")
    expect(steps[1].id).toBe("completed")
    expect(steps[1].state).toBe("upcoming")
    expect(steps[1].occurredAt).toBeNull()
    expect(steps[1].description).toContain("$9.95")
    expect(steps[1].description).toContain("account balance")
  })

  it("returns both steps complete when settled", () => {
    const steps = buildBankDepositLifecycle({
      status: "settled",
      metadata: {
        processing_at: "2026-05-19T22:00:46Z",
        completed_at: "2026-05-19T22:00:56Z",
        settled_amount: 9.95,
        settled_currency: "USD",
        fiat_deposit_amount: 12,
      },
      settledAt: "2026-05-19T22:00:56Z",
    })
    expect(steps[0].state).toBe("complete")
    expect(steps[1].state).toBe("complete")
    expect(steps[1].occurredAt).toBe("2026-05-19T22:00:56Z")
    expect(steps[0].description).toBe(
      "We've received your ACH deposit and are confirming the payment.",
    )
  })

  it("returns failed terminal step when cancelled", () => {
    const steps = buildBankDepositLifecycle({
      status: "cancelled",
      metadata: { processing_at: "2026-05-19T22:00:46Z" },
    })
    expect(steps[1].id).toBe("failed")
    expect(steps[1].title).toBe("Unable to complete")
  })
})

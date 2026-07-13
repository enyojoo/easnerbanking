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
        source_payment_rail: "ach",
      },
      createdAt: "2026-05-19T22:00:53Z",
    })
    expect(steps).toHaveLength(2)
    expect(steps[0].id).toBe("processing")
    expect(steps[0].state).toBe("current")
    expect(steps[1].id).toBe("completed")
    expect(steps[1].state).toBe("upcoming")
    expect(steps[1].occurredAt).toBeNull()
    expect(steps[1].description).toBe("Funds are now available in your account balance.")
  })

  it("shows completed in progress when fiat settled but on-chain pending", () => {
    const steps = buildBankDepositLifecycle({
      status: "settled",
      metadata: {
        processing_at: "2026-05-19T22:00:46Z",
        fiat_settled_at: "2026-05-19T22:00:53Z",
        deposit_kind: "funding",
        settled_amount: 9.95,
        settled_currency: "USD",
      },
    })
    expect(steps[0].state).toBe("complete")
    expect(steps[1].state).toBe("current")
    expect(steps[1].occurredAt).toBeNull()
  })

  it("returns both steps complete when on-chain settled", () => {
    const steps = buildBankDepositLifecycle({
      status: "settled",
      metadata: {
        processing_at: "2026-05-19T22:00:46Z",
        on_chain_settled_at: "2026-05-19T22:01:42Z",
        completed_at: "2026-05-19T22:01:42Z",
        settled_amount: 9.95,
        settled_currency: "USD",
        fiat_deposit_amount: 12,
        source_payment_rail: "wire",
        deposit_scheme_label: "Wire",
        deposit_kind: "funding",
      },
    })
    expect(steps[0].state).toBe("complete")
    expect(steps[1].state).toBe("complete")
    expect(steps[1].occurredAt).toBe("2026-05-19T22:01:42Z")
    expect(steps[0].description).toBe(
      "We've received your Wire deposit and confirming it.",
    )
    expect(steps[1].description).toBe("Funds are now available in your account balance.")
  })

  it("returns failed terminal step when cancelled", () => {
    const steps = buildBankDepositLifecycle({
      status: "cancelled",
      metadata: { processing_at: "2026-05-19T22:00:46Z" },
    })
    expect(steps[1].id).toBe("failed")
    expect(steps[1].title).toBe("Failed")
  })

  it("shows under-review copy when deposit split blocked for negative margin", () => {
    const steps = buildBankDepositLifecycle({
      status: "processing",
      metadata: {
        processing_at: "2026-05-19T22:00:46Z",
        deposit_split_status: "blocked_negative_margin",
        flow: "bank_onramp",
      },
    })
    expect(steps[0].state).toBe("current")
    expect(steps[0].description).toContain("reviewing this deposit")
    expect(steps[1].state).toBe("upcoming")
  })
})

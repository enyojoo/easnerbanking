import { describe, expect, it } from "vitest"
import { buildCrossBorderSendDetailRows } from "./yc-local-pay-in-detail-rows"
import { buildYcLocalPayInReviewRows } from "./yc-local-pay-in-review-rows"
import { TLC_LOCAL_TRANSFER_METHOD } from "./review-row-labels"

describe("buildCrossBorderSendDetailRows", () => {
  it("uses Amount paid and Local Transfer for TLC detail", () => {
    const rows = buildCrossBorderSendDetailRows({
      payoutReview: {
        you_send_amount: 50_000,
        total_debited: 50_000,
        exchange_fee: 1,
        processing_fee: 0.5,
        exchange_rate: 1600,
        send_currency: "NGN",
        receive_amount: 100,
        receive_currency: "USD",
        transfer_method: TLC_LOCAL_TRANSFER_METHOD,
        processing_time: "Within minutes",
        display_processing_fee_local: 800,
      },
      recipientSnapshot: { full_name: "Jane Doe", bank_name: "GTBank", account_number: "0123" },
      whenLabel: "Jul 16, 2026",
      displayProcessingFee: 800,
    })
    const labels = rows.map((r) => r.label)
    expect(labels).toContain("Amount paid")
    expect(labels).not.toContain("Total debited")
    expect(rows.find((r) => r.id === "transfer-method")?.value).toBe(TLC_LOCAL_TRANSFER_METHOD)
  })
})

describe("buildYcLocalPayInReviewRows", () => {
  it("locks TLC review with Local Transfer and Amount to pay", () => {
    const rows = buildYcLocalPayInReviewRows({
      mode: "cross_border_send",
      phase: "locked",
      rail: "bank_transfer",
      payInCurrency: "NGN",
      receiveCurrency: "USD",
      customerRate: 1600,
      localPayIn: 50_000,
      receiveAmount: 100,
      transactionId: "etid123",
      processingTime: "Within minutes",
    })
    expect(rows.some((r) => r.id === "transaction-id")).toBe(true)
    expect(rows.find((r) => r.id === "transfer-method")?.value).toBe(TLC_LOCAL_TRANSFER_METHOD)
    expect(rows.find((r) => r.id === "pay-amount")?.label).toBe("Amount to pay")
  })

  it("keeps fund-balance Bank Transfer label", () => {
    const rows = buildYcLocalPayInReviewRows({
      mode: "fund_balance",
      phase: "locked",
      rail: "bank_transfer",
      payInCurrency: "NGN",
      receiveCurrency: "USD",
      customerRate: 1600,
      localPayIn: 50_000,
      receiveAmount: 100,
      usdCredit: 100,
    })
    expect(rows.find((r) => r.id === "transfer-method")?.value).toBe("Bank Transfer")
  })
})

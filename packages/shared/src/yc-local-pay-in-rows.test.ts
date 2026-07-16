import { describe, expect, it } from "vitest"
import { buildCrossBorderSendDetailRows } from "./yc-local-pay-in-detail-rows"
import { buildYcLocalPayInCompleteRows } from "./yc-local-pay-in-complete-rows"
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
  it("locks TLC bank review with transfer amount and Total to pay", () => {
    const rows = buildYcLocalPayInReviewRows({
      mode: "cross_border_send",
      phase: "locked",
      rail: "bank_transfer",
      payInCurrency: "KES",
      receiveCurrency: "NGN",
      customerRate: 12.5,
      localPayIn: 50_000,
      receiveAmount: 4000,
      principalLocal: 50_000,
      transactionId: "etid123",
      processingTime: "Within minutes",
    })
    expect(rows.some((r) => r.id === "transaction-id")).toBe(true)
    expect(rows.find((r) => r.id === "deposit-amount")?.label).toBe("Transfer amount")
    expect(rows.find((r) => r.id === "transfer-method")?.value).toBe(TLC_LOCAL_TRANSFER_METHOD)
    expect(rows.find((r) => r.id === "pay-amount")?.label).toBe("Total to pay")
    expect(rows.find((r) => r.id === "pay-amount")?.valueBold).toBe(true)
  })

  it("keeps TLC MoMo preview with Estimated to pay", () => {
    const rows = buildYcLocalPayInReviewRows({
      mode: "cross_border_send",
      phase: "preview",
      rail: "mobile_money",
      payInCurrency: "KES",
      receiveCurrency: "NGN",
      customerRate: 12.5,
      localPayIn: 128_663,
      receiveAmount: 4000,
    })
    expect(rows.find((r) => r.id === "pay-amount")?.label).toBe("Estimated to pay")
    expect(rows.find((r) => r.id === "transfer-method")?.value).toBe(TLC_LOCAL_TRANSFER_METHOD)
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

describe("buildYcLocalPayInCompleteRows", () => {
  it("uses minimal TLC bank complete card", () => {
    const rows = buildYcLocalPayInCompleteRows({
      mode: "cross_border_send",
      rail: "bank_transfer",
      transactionId: "etid123",
      payInCurrency: "KES",
      receiveCurrency: "NGN",
      localPayIn: 265_082,
      receiveAmount: 4000,
      customerRate: 12.5,
    })
    expect(rows.map((r) => r.id)).toEqual([
      "transaction-id",
      "recipient-gets",
      "transfer-method",
    ])
    expect(rows.find((r) => r.id === "transfer-method")?.value).toBe(TLC_LOCAL_TRANSFER_METHOD)
  })

  it("mirrors fund-balance MoMo breakdown for TLC MoMo complete", () => {
    const rows = buildYcLocalPayInCompleteRows({
      mode: "cross_border_send",
      rail: "mobile_money",
      transactionId: "etid456",
      payInCurrency: "KES",
      receiveCurrency: "USD",
      localPayIn: 132_541,
      receiveAmount: 1000,
      customerRate: 128.66,
      principalLocal: 128_663,
      processingFeeLocal: 3878,
    })
    const ids = rows.map((r) => r.id)
    expect(ids).toContain("exchange-rate")
    expect(ids).toContain("deposit-amount")
    expect(rows.find((r) => r.id === "deposit-amount")?.label).toBe("Transfer amount")
    expect(ids).toContain("processing-fee")
    expect(ids).toContain("total-to-pay")
    expect(ids).toContain("recipient-gets")
    expect(rows.find((r) => r.id === "total-to-pay")?.valueBold).toBe(true)
    expect(rows.find((r) => r.id === "transfer-method")?.value).toBe(TLC_LOCAL_TRANSFER_METHOD)
  })
})

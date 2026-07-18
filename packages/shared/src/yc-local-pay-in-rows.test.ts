import { describe, expect, it } from "vitest"
import { buildCrossBorderSendDetailRows } from "./yc-local-pay-in-detail-rows"
import { buildYcLocalPayInCompleteRows } from "./yc-local-pay-in-complete-rows"
import { buildYcLocalPayInReviewRows } from "./yc-local-pay-in-review-rows"
import { resolveYcCrossBorderLocalPayInBreakdown } from "./transactions/yc-deposit-display"
import { TLC_LOCAL_TRANSFER_METHOD } from "./review-row-labels"

describe("buildCrossBorderSendDetailRows", () => {
  it("shows transfer amount, fee, rate, amount paid — not recipient gets", () => {
    const rows = buildCrossBorderSendDetailRows({
      payoutReview: {
        you_send_amount: 94_606.3,
        total_debited: 94_606.3,
        exchange_fee: 14.8,
        processing_fee: 7.207657,
        exchange_rate: 10.715354715212,
        send_currency: "KES",
        receive_amount: 988_500,
        receive_currency: "NGN",
        transfer_method: TLC_LOCAL_TRANSFER_METHOD,
        processing_time: "Within minutes",
        display_processing_fee_local: 2830.91,
        principal_local_pay_in: 92_250.8,
      },
      recipientSnapshot: { full_name: "Jane Doe", bank_name: "GTBank", account_number: "0123" },
      whenLabel: "Jul 16, 2026",
      displayProcessingFee: 2830.91,
    })
    const labels = rows.map((r) => r.label)
    expect(labels).toEqual([
      "Transfer amount",
      "Processing fee",
      "Exchange rate",
      "Amount paid",
      "Recipient",
      "Transfer method",
      "When",
    ])
    expect(labels).not.toContain("Recipient gets")
    expect(rows.find((r) => r.id === "transfer-amount")?.value).toContain("92,251")
    expect(rows.find((r) => r.id === "processing-fee")?.value).toContain("2,831")
    expect(rows.find((r) => r.id === "amount-paid")?.value).toContain("94,606")
    expect(rows.find((r) => r.id === "amount-paid")?.valueBold).toBe(true)
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

  it("locks fund-balance MoMo review with deposit amount and Total to pay", () => {
    const rows = buildYcLocalPayInReviewRows({
      mode: "fund_balance",
      phase: "locked",
      rail: "mobile_money",
      payInCurrency: "KES",
      receiveCurrency: "USD",
      customerRate: 132.5,
      localPayIn: 160_000,
      receiveAmount: 1200,
      usdCredit: 1200,
      principalLocal: 159_000,
      processingFeeLocal: 1000,
    })
    expect(rows.find((r) => r.id === "deposit-amount")?.label).toBe("Deposit amount")
    expect(rows.find((r) => r.id === "pay-amount")?.label).toBe("Total to pay")
    expect(rows.find((r) => r.id === "amount-to-credit")?.label).toBe("Amount to credit")
    expect(rows.find((r) => r.id === "pay-amount")?.valueBold).toBe(true)
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

  it("uses minimal fund-balance MoMo complete card like bank", () => {
    const rows = buildYcLocalPayInCompleteRows({
      mode: "fund_balance",
      rail: "mobile_money",
      transactionId: "etid789",
      payInCurrency: "KES",
      receiveCurrency: "USD",
      localPayIn: 15_500,
      receiveAmount: 1200,
      customerRate: 129.5,
      processingFeeLocal: 200,
    })
    expect(rows.map((r) => r.id)).toEqual([
      "transaction-id",
      "amount-to-credit",
      "transfer-method",
    ])
  })

  it("mirrors fund-balance MoMo breakdown for TLC MoMo complete with footed fee", () => {
    const breakdown = resolveYcCrossBorderLocalPayInBreakdown({
      localPayIn: 307.94,
      payInCurrency: "KES",
      receiveAmount: 3221,
      customerRate: 10.735227698797,
      provisionalPayIn: 300.04,
      displayProcessingFeeLocal: 9.45,
    })
    const rows = buildYcLocalPayInCompleteRows({
      mode: "cross_border_send",
      rail: "mobile_money",
      transactionId: "etid456",
      payInCurrency: "KES",
      receiveCurrency: "NGN",
      localPayIn: breakdown.totalLocal,
      receiveAmount: 3221,
      customerRate: 10.735227698797,
      principalLocal: breakdown.principalLocal,
      processingFeeLocal: breakdown.feeLocal,
    })
    const ids = rows.map((r) => r.id)
    expect(ids).toContain("exchange-rate")
    expect(ids).toContain("deposit-amount")
    expect(rows.find((r) => r.id === "deposit-amount")?.label).toBe("Transfer amount")
    expect(ids).toContain("processing-fee")
    expect(ids).toContain("total-to-pay")
    expect(ids).toContain("recipient-gets")
    expect(breakdown.principalLocal + breakdown.feeLocal).toBe(breakdown.totalLocal)
    expect(rows.find((r) => r.id === "total-to-pay")?.valueBold).toBe(true)
    expect(rows.find((r) => r.id === "transfer-method")?.value).toBe(TLC_LOCAL_TRANSFER_METHOD)
  })
})

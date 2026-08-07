import { describe, expect, it } from "vitest"
import { buildCrossBorderSendDetailRows } from "./yc-local-pay-in-detail-rows"
import { buildYcLocalPayInCompleteRows } from "./yc-local-pay-in-complete-rows"
import { buildYcLocalPayInReviewRows } from "./yc-local-pay-in-review-rows"
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
    expect(labels).not.toContain("Recipient amount")
    expect(rows.find((r) => r.id === "transfer-amount")?.value).toContain("92,250.80")
    expect(rows.find((r) => r.id === "processing-fee")?.value).toContain("2,355.50")
    expect(rows.find((r) => r.id === "amount-paid")?.value).toContain("94,606.30")
    expect(rows.find((r) => r.id === "amount-paid")?.valueBold).toBe(true)
    expect(rows.find((r) => r.id === "transfer-method")?.value).toBe(TLC_LOCAL_TRANSFER_METHOD)
  })
})

describe("buildYcLocalPayInReviewRows", () => {
  it("keeps Recipient amount anchored to the requested amount when YC locks a higher quantum", () => {
    const rows = buildYcLocalPayInReviewRows({
      mode: "cross_border_send",
      phase: "locked",
      rail: "bank_transfer",
      payInCurrency: "USD",
      receiveCurrency: "NGN",
      customerRate: 1378,
      localPayIn: 1.5,
      requestedReceiveAmount: 2005,
      receiveAmount: 2012.2,
    })
    expect(rows.find((row) => row.id === "requested-recipient-amount")).toBeUndefined()
    expect(rows.find((row) => row.id === "recipient-gets")?.value).toContain("2,005")
  })

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

  it("shows TLC bank preview with transfer amount and processing fee", () => {
    const rows = buildYcLocalPayInReviewRows({
      mode: "cross_border_send",
      phase: "preview",
      rail: "bank_transfer",
      payInCurrency: "NGN",
      receiveCurrency: "PHP",
      customerRate: 0.0444,
      localPayIn: 3393.9,
      receiveAmount: 150,
      principalLocal: 3377.01,
      processingFeeLocal: 16.89,
    })
    expect(rows.find((r) => r.id === "deposit-amount")?.label).toBe("Transfer amount")
    expect(rows.find((r) => r.id === "processing-fee")?.value).toContain("16.89")
    expect(rows.find((r) => r.id === "recipient-gets")?.value).toContain("150")
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
    expect(rows.find((r) => r.id === "transfer-method")?.label).toBe("Deposit method")
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

  it("keeps exact MoMo local pay-in kobo/cents on Total to pay", () => {
    const rows = buildYcLocalPayInReviewRows({
      mode: "fund_balance",
      phase: "locked",
      rail: "mobile_money",
      payInCurrency: "NGN",
      receiveCurrency: "USD",
      customerRate: 1429.148,
      localPayIn: 3678.96,
      receiveAmount: 2.5,
      usdCredit: 2.5,
      principalLocal: 3572.87,
      processingFeeLocal: 106.09,
    })
    expect(rows.find((r) => r.id === "pay-amount")?.value).toBe("₦3,678.96")
    expect(rows.find((r) => r.id === "deposit-amount")?.value).toBe("₦3,572.87")
    expect(rows.find((r) => r.id === "processing-fee")?.value).toBe("₦106.09")
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

  it("uses minimal TLC MoMo complete card like fund-balance MoMo", () => {
    const rows = buildYcLocalPayInCompleteRows({
      mode: "cross_border_send",
      rail: "mobile_money",
      transactionId: "etid456",
      payInCurrency: "KES",
      receiveCurrency: "NGN",
      localPayIn: 92_357,
      receiveAmount: 965_000,
      customerRate: 10.715354715212,
      principalLocal: 90_058,
      processingFeeLocal: 2763.85,
    })
    expect(rows.map((r) => r.id)).toEqual([
      "transaction-id",
      "recipient-gets",
      "transfer-method",
    ])
    expect(rows.find((r) => r.id === "recipient-gets")?.value).toContain("965")
    expect(rows.find((r) => r.id === "transfer-method")?.value).toBe(TLC_LOCAL_TRANSFER_METHOD)
  })
})

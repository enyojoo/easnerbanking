import { describe, expect, it } from "vitest"
import { REVIEW_ROW_LABELS } from "../review-row-labels"
import {
  buildTransactionReceiptDetailRows,
  parseBalanceLabelCurrency,
  resolveReceiptCurrencyFlagCode,
} from "./transaction-receipt-detail-rows"

describe("buildTransactionReceiptDetailRows", () => {
  it("maps payout recipient to visual recipient row", () => {
    const rows = buildTransactionReceiptDetailRows({
      direction: "out",
      payoutReview: {
        you_send_amount: 100,
        total_debited: 101,
        exchange_fee: 0,
        processing_fee: 1,
        exchange_rate: 1500,
        send_currency: "USD",
        receive_amount: 150000,
        receive_currency: "NGN",
        transfer_method: "Bank transfer",
        processing_time: "Same day",
      },
      recipientSnapshot: {
        full_name: "Jane Doe",
        bank_name: "GTBank",
        account_number: "0123",
        country_code: "NG",
        currency: "NGN",
      },
    })
    const recipient = rows.find((row) => row.label === REVIEW_ROW_LABELS.recipient)
    const exchangeRate = rows.find((row) => row.label === REVIEW_ROW_LABELS.exchangeRate)
    expect(rows.some((row) => row.label === REVIEW_ROW_LABELS.recipientGets)).toBe(false)
    expect(exchangeRate).toEqual({
      kind: "text",
      label: REVIEW_ROW_LABELS.exchangeRate,
      value: "$1 = ₦1,500.00",
    })
    expect(recipient?.kind).toBe("recipient")
    if (recipient?.kind === "recipient") {
      expect(recipient.display.fullName).toBe("Jane Doe")
      expect(recipient.display.countryCode).toBe("NG")
    }
  })

  it("maps debited from to balance destination row", () => {
    const rows = buildTransactionReceiptDetailRows({
      direction: "out",
      payoutReview: {
        you_send_amount: 100,
        total_debited: 101,
        exchange_fee: 0,
        processing_fee: 1,
        exchange_rate: 1,
        send_currency: "USD",
        receive_amount: 100,
        receive_currency: "USD",
        transfer_method: "Bank transfer",
        processing_time: "Same day",
      },
    })
    const debited = rows.find((row) => row.label === REVIEW_ROW_LABELS.debitedFrom)
    expect(debited).toEqual({
      kind: "balanceDestination",
      label: REVIEW_ROW_LABELS.debitedFrom,
      currency: "USD",
      balanceLabel: "USD Balance",
    })
  })

  it("maps inbound credit destination with currency flag metadata", () => {
    const rows = buildTransactionReceiptDetailRows({
      direction: "in",
      inboundReceive: {
        kind: "noah_va_funding",
        displayTitle: "Bank deposit",
        transactionId: "ETID1",
        whenAt: new Date().toISOString(),
        amountCredited: { amount: 99, currency: "USD" },
        creditDestination: {
          label: "credit_to",
          balanceLabel: "USD Balance",
          currency: "USD",
        },
        scheme: "ACH",
        sender: "Chase",
      },
    })
    const credited = rows.find((row) => row.label === REVIEW_ROW_LABELS.creditTo)
    expect(credited).toEqual({
      kind: "balanceDestination",
      label: REVIEW_ROW_LABELS.creditTo,
      currency: "USD",
      balanceLabel: "USD Balance",
    })
  })
})

describe("receipt flag helpers", () => {
  it("parses balance label currency", () => {
    expect(parseBalanceLabelCurrency("EUR Balance")).toBe("EUR")
  })

  it("resolves receipt flag codes", () => {
    expect(resolveReceiptCurrencyFlagCode("USD")).toBe("us")
    expect(resolveReceiptCurrencyFlagCode("EUR")).toBe("eu")
  })
})

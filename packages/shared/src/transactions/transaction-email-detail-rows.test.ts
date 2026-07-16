import { describe, expect, it } from "vitest"
import { buildTransactionEmailDetailRows, filterTransactionReceiptDetailRows } from "./transaction-email-detail-rows"
import { resolveInboundReceiveDetail } from "./inbound-receive-detail"
import type { GlobalPayoutReviewSnapshot } from "./global-payout-types"

function rowMap(rows: { label: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.label, r.value]))
}

describe("buildTransactionEmailDetailRows", () => {
  it("global payout: combined Processing fee, Local transfer, footing holds", () => {
    const review: GlobalPayoutReviewSnapshot = {
      you_send_amount: 100,
      total_debited: 103.32,
      exchange_fee: 2.32, // channel component (display)
      processing_fee: 1, // explicit 1% leg
      exchange_rate: 1342.75,
      send_currency: "USD",
      receive_amount: 134275,
      receive_currency: "NGN",
      transfer_method: "Bank transfer",
      processing_time: "Within minutes",
    }
    const rows = buildTransactionEmailDetailRows({
      direction: "out",
      payoutReview: review,
      recipient: { fullName: "Samuel Odiba", bankName: "Kuda", accountNumber: "1234567890" },
    })
    const map = rowMap(rows)
    expect(map["Sent"]).toBe("$100")
    // Combined Processing fee = 1 + 2.32 = 3.32, and 100 + 3.32 = 103.32 (Total debited).
    expect(map["Processing fee"]).toBe("$3.32")
    expect(map["Total debited"]).toBe("$103.32")
    expect(map["Exchange rate"]).toBeDefined()
    expect(map["Transfer method"]).toBe("Local transfer")
    expect(map["Recipient"]).toContain("Samuel Odiba")
    // No standalone Exchange fee row.
    expect(map["Exchange fee"]).toBeUndefined()
  })

  it("wallet send: shows USDC on SOL transfer method and 1% fee", () => {
    const review: GlobalPayoutReviewSnapshot = {
      you_send_amount: 1,
      total_debited: 1.01,
      exchange_fee: 0,
      processing_fee: 0.01,
      exchange_rate: 1,
      send_currency: "USD",
      receive_amount: 1,
      receive_currency: "USDC",
      transfer_method: "USDC on SOL",
      processing_time: "Within seconds",
    }
    const rows = buildTransactionEmailDetailRows({
      direction: "out",
      payoutReview: review,
      receiveNetwork: "Solana",
    })
    const map = rowMap(rows)
    expect(map["Processing fee"]).toBe("$0.01")
    expect(map["Transfer method"]).toBe("USDC on SOL")
    // 1:1 stablecoin parity: no Exchange rate row.
    expect(map["Exchange rate"]).toBeUndefined()
  })

  it("bank deposit: Scheme, Sender, Processing fee, Amount credited", () => {
    const rows = buildTransactionEmailDetailRows({
      direction: "in",
      deposit: {
        scheme: "Wire",
        senderDisplay: "ACME CORP",
        feeAmount: 0.05,
        feeCurrency: "USD",
        postedAmount: 9.95,
        postedCurrency: "USD",
        narration: "Invoice 42",
      },
    })
    const map = rowMap(rows)
    expect(map["Scheme"]).toBe("Wire")
    expect(map["Sender"]).toBe("ACME CORP")
    expect(map["Processing fee"]).toBe("$0.05")
    expect(map["Amount credited"]).toBe("$9.95")
    expect(map["Sender"]).toBe("ACME CORP")
    expect(map["Narration"]).toBe("Invoice 42")
  })

  it("organic stablecoin deposit with $0 fee hides the Processing fee row", () => {
    const rows = buildTransactionEmailDetailRows({
      direction: "in",
      deposit: {
        scheme: "USDC on SOL",
        senderDisplay: "0x1a2b...c3d4",
        feeAmount: 0,
        postedAmount: 50,
        postedCurrency: "USD",
      },
    })
    const map = rowMap(rows)
    expect(map["Processing fee"]).toBeUndefined()
    expect(map["Amount credited"]).toBe("$50")
  })

  it("YC fund_balance deposit_review rows mirror review screen", () => {
    const rows = buildTransactionEmailDetailRows({
      direction: "in",
      depositReview: {
        local_pay_in: 100000,
        local_currency: "NGN",
        usd_credit: 65,
        processing_fee: 0.65,
        exchange_fee: 0.1,
        exchange_rate: 1538.46,
        transfer_method: "Bank Transfer",
        credit_to: "USD Balance",
        residence_country: "NG",
        pay_in_rail: "bank_transfer",
      },
    })
    const map = rowMap(rows)
    expect(map["Amount paid"]).toBe("₦100,000")
    expect(map["Processing fee"]).toBeDefined()
    expect(map["Exchange rate"]).toBeDefined()
    expect(map["Amount credited"]).toBe("$65")
    expect(map["Credited to"]).toBe("USD Balance")
    expect(map["Scheme"]).toBe("Bank Transfer")
    expect(map["Transfer method"]).toBeUndefined()
    expect(map["Credit amount"]).toBeUndefined()
    expect(map["Narration"]).toBeUndefined()
  })

  it("unified inboundReceive snapshot rows", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      deposit_review: {
        local_pay_in: 100000,
        local_currency: "NGN",
        usd_credit: 65,
        processing_fee: 0.65,
        exchange_fee: 0.1,
        exchange_rate: 1538.46,
        transfer_method: "Mobile Money",
        credit_to: "USD Balance",
        residence_country: "NG",
        pay_in_rail: "mobile_money",
      },
    })
    const rows = buildTransactionEmailDetailRows({ direction: "in", inboundReceive: snapshot! })
    const map = rowMap(rows)
    expect(map["Scheme"]).toBe("Mobile Money")
    expect(map["Amount credited"]).toBe("$65")
  })

  it("filterTransactionReceiptDetailRows omits narration", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "noah",
      metadata: {
        flow: "bank_onramp",
        posted_amount: 10,
        posted_currency: "USD",
        deposit_scheme_label: "ACH",
        narration: "Ref 1",
      },
    })
    const filtered = filterTransactionReceiptDetailRows(
      buildTransactionEmailDetailRows({ direction: "in", inboundReceive: snapshot! }),
    )
    expect(filtered.map((r) => r.label)).not.toContain("Narration")
    expect(filtered.map((r) => r.label)).toContain("Amount credited")
  })

  it("returns no rows for shapes without enrichment (e.g. Easetag)", () => {
    expect(buildTransactionEmailDetailRows({ direction: "out" })).toEqual([])
    expect(buildTransactionEmailDetailRows({ direction: "in" })).toEqual([])
  })

  it("filterTransactionReceiptDetailRows omits Exchange rate and Transfer method", () => {
    const review: GlobalPayoutReviewSnapshot = {
      you_send_amount: 100,
      total_debited: 101,
      exchange_fee: 0,
      processing_fee: 1,
      exchange_rate: 1342.75,
      send_currency: "USD",
      receive_amount: 134275,
      receive_currency: "NGN",
      transfer_method: "Bank transfer",
      processing_time: "Within minutes",
    }
    const rows = buildTransactionEmailDetailRows({
      direction: "out",
      payoutReview: review,
      recipient: { fullName: "Samuel Odiba", bankName: "Kuda", accountNumber: "1234567890" },
    })
    const filtered = filterTransactionReceiptDetailRows(rows)
    const labels = filtered.map((r) => r.label)
    expect(labels).not.toContain("Exchange rate")
    expect(labels).not.toContain("Transfer method")
    expect(labels).toContain("Sent")
    expect(labels).toContain("Recipient")
  })
})

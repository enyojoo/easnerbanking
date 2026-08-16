import { describe, expect, it, vi } from "vitest"

vi.mock("@easner/shared", async () => {
  const derive = await import(
    "../../../packages/shared/src/transactions/derive-transaction-notification"
  )
  return {
    deriveTransactionNotification: derive.deriveTransactionNotification,
    descriptorToPushContent: derive.descriptorToPushContent,
  }
})

import { buildTransactionSettledPushContent } from "./transaction-settled-content"

describe("buildTransactionSettledPushContent", () => {
  it("returns alternate push for verification deposits", () => {
    const { title, body } = buildTransactionSettledPushContent({
      provider: "noah",
      direction: "in",
      amount: 0.32,
      currency: "USD",
      metadata: {
        flow: "bank_onramp",
        deposit_kind: "verification",
        verification_bank_name: "Chase",
        fiat_deposit_amount: 0.32,
      },
    })
    expect(title).toBe("Bank verification deposit")
    expect(body).toBe("You've received $0.32 from Chase")
  })

  it("still uses bank deposit push for funding onramp", () => {
    const { title, body } = buildTransactionSettledPushContent({
      provider: "noah",
      direction: "in",
      amount: 12,
      currency: "USD",
      metadata: {
        flow: "bank_onramp",
        deposit_kind: "funding",
        settled_amount: 9.95,
      },
    })
    expect(title).toBe("US bank deposit complete")
    expect(body).toBe("You've received $9.95 via ACH")
  })

  it("uses transfer method headline for failed global payout", () => {
    const { title, body } = buildTransactionSettledPushContent({
      provider: "noah",
      direction: "out",
      amount: 4.52,
      currency: "USD",
      outcome: "failed",
      failureReason: "Recipient bank rejected the transfer.",
      metadata: {
        payout_type: "global_fiat",
        receive_amount: 5000,
        receive_currency: "NGN",
        payout_review: {
          you_send_amount: 4,
          total_debited: 4.52,
          exchange_fee: 0.32,
          processing_fee: 0.2,
          exchange_rate: 1342.75,
          send_currency: "USD",
          receive_amount: 5000,
          receive_currency: "NGN",
          transfer_method: "Mobile money transfer",
          processing_time: "Within minutes",
        },
        recipient_snapshot: { full_name: "SAMUEL ODIBA ENYOJO" },
      },
    })
    expect(title).toBe("Mobile transfer failed")
    expect(body).toContain("Could not send")
    expect(body).toContain("Recipient bank rejected")
    expect(body).toContain("Any debited funds have been returned to your balance.")
  })

  it("uses receive fiat and corridor title for global payout send", () => {
    const { title, body } = buildTransactionSettledPushContent({
      provider: "noah",
      direction: "out",
      amount: 4.52,
      currency: "USD",
      metadata: {
        payout_type: "global_fiat",
        receive_amount: 5000,
        receive_currency: "NGN",
        payout_review: {
          you_send_amount: 4,
          total_debited: 4.52,
          exchange_fee: 0.32,
          processing_fee: 0.2,
          exchange_rate: 1342.75,
          send_currency: "USD",
          receive_amount: 5000,
          receive_currency: "NGN",
          transfer_method: "Bank transfer",
          processing_time: "Within minutes",
        },
        recipient_snapshot: { full_name: "SAMUEL ODIBA ENYOJO" },
      },
    })
    expect(title).toBe("Bank transfer complete")
    expect(body).toBe("You've sent ₦5,000 to Samuel Odiba Enyojo")
  })

  it("uses Stablecoin Transfer title and receive amount for wallet send", () => {
    const { title, body } = buildTransactionSettledPushContent({
      provider: "turnkey",
      direction: "out",
      amount: 1.01,
      currency: "USD",
      metadata: {
        activity_type: "wallet_send",
        receive_amount: 1,
        receive_asset: "USDC",
        counterparty_address: "Fjw9otXwdkzbc3feiBzBnFqCr52858YbyZsxxLWfP5Xc",
        payout_review: {
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
        },
      },
    })
    expect(title).toBe("Stablecoin transfer complete")
    expect(body).toBe("You've sent $1 to Fjw9ot...WfP5Xc")
  })

  it("falls back to metadata receive amount for pre-snapshot global payout", () => {
    const { title, body } = buildTransactionSettledPushContent({
      provider: "noah",
      direction: "out",
      amount: 4.52,
      currency: "USD",
      metadata: {
        payout_type: "global_fiat",
        receive_amount: 5000,
        receive_currency: "NGN",
        beneficiary_name: "SAMUEL",
      },
    })
    expect(title).toBe("Bank transfer complete")
    expect(body).toContain("₦5,000")
    expect(body).toContain("Samuel")
  })
})

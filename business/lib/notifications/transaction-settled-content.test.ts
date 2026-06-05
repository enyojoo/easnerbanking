import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils", () => ({
  formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
}))

vi.mock("@easner/shared", () => ({
  BANK_DEPOSIT_COMPLETED_DESCRIPTION: "Funds are now available in your account balance.",
  isBankOnrampDepositFlow: (meta: Record<string, unknown> | null | undefined) =>
    String(meta?.flow ?? "").toLowerCase() === "bank_onramp",
  isGlobalPayoutOffRampFlow: (meta: Record<string, unknown> | null | undefined) =>
    String(meta?.payout_type ?? "").toLowerCase() === "global_fiat",
  isVerificationDepositMetadata: (meta: Record<string, unknown> | null | undefined) =>
    String(meta?.deposit_kind ?? "").toLowerCase() === "verification",
  deriveVerificationBankName: (input: { metadata?: Record<string, unknown> | null }) =>
    String(input.metadata?.verification_bank_name ?? "Your bank"),
  formatVerificationDepositPushBody: (input: {
    amount: number
    currency: string
    bankName: string
  }) => `Received $${input.amount.toFixed(2)} from ${input.bankName}`,
  deriveEasnerInboundRemitterDisplayName: () => undefined,
  formatDisplayPersonName: (n: string) =>
    n === "SAMUEL ODIBA ENYOJO"
      ? "Samuel Odiba Enyojo"
      : n === "SAMUEL"
        ? "Samuel"
        : n,
  formatMoneyDisplay: (amount: number, currency: string) =>
    currency.toUpperCase() === "NGN"
      ? `₦${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `$${amount.toFixed(2)}`,
  truncateMiddle: (s: string, start = 6, end = 6) => {
    const t = s.trim()
    if (t.length <= start + end + 3) return t
    return `${t.slice(0, start)}...${t.slice(-end)}`
  },
  toEasnerTransactionProductCategory: () => "Bank Deposit",
}))

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
    expect(title).toBe("Bank verification credit")
    expect(body).toBe("Received $0.32 from Chase")
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
    expect(title).toBe("Bank Deposit")
    expect(body).toContain("Funds are now available")
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
    expect(title).toBe("Bank transfer")
    expect(body).toBe("Sent ₦5,000.00 to Samuel Odiba Enyojo")
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
    expect(title).toBe("Stablecoin Transfer")
    expect(body).toBe("Sent $1.00 to Fjw9ot...WfP5Xc")
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
    expect(title).toBe("Bank transfer")
    expect(body).toContain("₦5,000.00")
    expect(body).toContain("Samuel")
  })
})

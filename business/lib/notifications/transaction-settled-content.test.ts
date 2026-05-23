import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils", () => ({
  formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
}))

vi.mock("@easner/shared", () => ({
  BANK_DEPOSIT_COMPLETED_DESCRIPTION: "Funds are now available in your account balance.",
  isBankOnrampDepositFlow: (meta: Record<string, unknown> | null | undefined) =>
    String(meta?.flow ?? "").toLowerCase() === "bank_onramp",
  isVerificationDepositMetadata: (meta: Record<string, unknown> | null | undefined) =>
    String(meta?.deposit_kind ?? "").toLowerCase() === "verification",
  deriveVerificationBankName: (input: { metadata?: Record<string, unknown> | null }) =>
    String(input.metadata?.verification_bank_name ?? "Your bank"),
  deriveEasnerInboundRemitterDisplayName: () => undefined,
  formatDisplayPersonName: (n: string) => n,
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
    expect(body).toContain("$0.32")
    expect(body).toContain("Chase")
    expect(body).toContain("not added to your balance")
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
})

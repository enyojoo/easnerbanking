import { describe, expect, it, vi } from "vitest"

vi.mock("@easner/shared", () => ({
  isVerificationDepositMetadata: () => false,
  toEasnerTransactionPrimaryLabel: () => "Transfer",
  formatMoneyDisplay: (amount: number, currency: string) => {
    const sym =
      currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "NGN" ? "₦" : currency
    return `${sym}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  },
}))

vi.mock("@/lib/transactions/resolve-global-payout-off-ramp", () => ({
  resolveGlobalPayoutOffRampDetail: (row: Record<string, unknown>) => {
    const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
    if (String(meta.payout_type ?? "").toLowerCase() !== "global_fiat") return null
    return {
      displayAmount: Number(meta.receive_amount ?? 0),
      displayCurrency: String(meta.receive_currency ?? "USD"),
      ledgerAmount: Number(row.amount ?? 0),
      ledgerCurrency: String(row.currency ?? "USD"),
      displayDescription: "Jane Doe",
      displayHeroTitle: "Sent to Jane Doe",
      effectiveMetadata: meta,
      lifecycle: [],
      payoutReview: null,
      recipientSnapshot: null,
      sendNote: null,
      processingAt: null,
      completedAt: null,
      easnerPayoutId: null,
    }
  },
}))

import {
  formatOfficeTxAmount,
  formatOfficeTxBalanceAmount,
  resolveOfficeTxPresentation,
} from "./office-overview-compute"

describe("office global payout presentation", () => {
  it("shows local receive fiat and USD balance debit for Noah payouts", () => {
    const tx = {
      id: "gp-1",
      direction: "out",
      status: "settled",
      amount: 4.52,
      currency: "USD",
      base_currency: "USD",
      provider: "noah",
      metadata: {
        payout_type: "global_fiat",
        total_debited: 50,
        send_currency: "USD",
        receive_amount: 80000,
        receive_currency: "NGN",
      },
    }

    const pres = resolveOfficeTxPresentation(tx)
    expect(pres.displayCurrency).toBe("NGN")
    expect(pres.displayAmount).toBe(80000)
    expect(pres.balanceCurrency).toBe("USD")
    expect(pres.balanceAmount).toBe(50)
    expect(formatOfficeTxAmount(tx)).toContain("₦")
    expect(formatOfficeTxBalanceAmount(tx)).toBe("$50.00")
  })
})

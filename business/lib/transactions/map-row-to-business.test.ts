import { describe, expect, it, vi } from "vitest"

vi.mock("@easner/shared", () => ({
  deriveBankDepositInboundDisplayLabel: () => undefined,
  displayEasnerTransactionIdForList: (input: {
    easnerTransactionId?: string | null
    fallbackId?: string | null
  }) => input.easnerTransactionId || input.fallbackId || "",
  formatDisplayPersonName: (n: string) => n,
  formatTransactionDetailHeroTitle: () => undefined,
  isBankOnrampDepositFlow: () => false,
  isVerificationDepositMetadata: () => false,
  mapLedgerStatusForUserFeed: (st: string) => (st === "settled" ? "completed" : st),
  resolveGlobalPayoutListDisplay: (row: Record<string, unknown>) => {
    const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
    if (String(meta.payout_type ?? "").toLowerCase() !== "global_fiat") return null
    return {
      displayAmount: Number(meta.receive_amount ?? row.amount ?? 0),
      displayCurrency: String(meta.receive_currency ?? row.currency ?? "USD"),
      ledgerAmount: Number(row.amount ?? 0),
      ledgerCurrency: String(row.currency ?? "USD"),
      displayDescription: String(meta.beneficiary_name ?? "Transfer"),
      displayHeroTitle: `Transfer to ${meta.beneficiary_name ?? "Transfer"}`,
    }
  },
  toEasnerTransactionPrimaryLabel: () => "Bank Deposit",
}))

vi.mock("@/lib/transactions/resolve-global-payout-off-ramp", () => ({
  resolveGlobalPayoutOffRampDetail: () => null,
}))

vi.mock("@/lib/noah/bank-onramp-tx", () => ({
  isNoahBankOnrampFiatPayIn: () => false,
}))

import { mapRowToBusinessTransaction } from "./map-row-to-business"

describe("mapRowToBusinessTransaction", () => {
  it("uses shared display id and status helpers", () => {
    const item = mapRowToBusinessTransaction({
      id: "db-uuid",
      easner_transaction_id: "ETID00001234",
      provider: "noah",
      status: "settled",
      amount: 25,
      currency: "USD",
      direction: "in",
      metadata: null,
      created_at: "2025-01-15T12:00:00.000Z",
    })

    expect(item.id).toBe("ETID00001234")
    expect(item.status).toBe("completed")
    expect(item.direction).toBe("credit")
  })

  it("maps global payout list display from metadata without payload", () => {
    const item = mapRowToBusinessTransaction({
      id: "db-uuid",
      provider: "noah",
      status: "pending",
      amount: 25,
      currency: "USD",
      direction: "out",
      metadata: {
        payout_type: "global_fiat",
        receive_amount: 5000,
        receive_currency: "NGN",
        beneficiary_name: "Jane Doe",
      },
      created_at: "2025-01-15T12:00:00.000Z",
    })

    expect(item.amount).toBe(5000)
    expect(item.displayCurrency).toBe("NGN")
    expect(item.description).toBe("Jane Doe")
    expect(item.baseAmount).toBe(25)
    expect(item.baseCurrency).toBe("USD")
  })
})

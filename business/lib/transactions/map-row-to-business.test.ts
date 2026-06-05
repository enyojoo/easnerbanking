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
  resolveWalletSendListDisplay: (row: Record<string, unknown>) => {
    const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
    if (String(meta.activity_type ?? "").toLowerCase() !== "wallet_send") return null
    return {
      displayAmount: Number(meta.receive_amount ?? row.amount ?? 0),
      displayCurrency: String(meta.receive_asset ?? row.currency ?? "USD"),
      ledgerAmount: Number(row.amount ?? 0),
      ledgerCurrency: String(row.currency ?? "USD"),
      displayDescription: String(meta.counterparty_name ?? "Wallet transfer"),
      displayHeroTitle: `Transfer to ${meta.counterparty_name ?? "Wallet transfer"}`,
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

vi.mock("@/lib/wallet-send/build-wallet-send-payout-review", () => ({
  isWalletSendOutRow: (row: { metadata?: Record<string, unknown> | null }) =>
    String(row.metadata?.activity_type ?? "").toLowerCase() === "wallet_send",
  resolveWalletSendPayoutReview: (meta: Record<string, unknown>) => {
    if (String(meta.activity_type ?? "").toLowerCase() !== "wallet_send") return null
    const nested = meta.payout_review as Record<string, unknown> | undefined
    if (!nested || typeof nested !== "object") return null
    return nested
  },
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

  it("maps wallet send list display from metadata", () => {
    const item = mapRowToBusinessTransaction({
      id: "db-uuid",
      provider: "turnkey",
      status: "settled",
      amount: 1.01,
      currency: "USD",
      direction: "out",
      metadata: {
        activity_type: "wallet_send",
        receive_amount: 1,
        receive_asset: "USDC",
        counterparty_name: "External Wallet",
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
          execution_model: "direct_turnkey",
        },
      },
      created_at: "2025-01-15T12:00:00.000Z",
    })

    expect(item.amount).toBe(1)
    expect(item.displayCurrency).toBe("USDC")
    expect(item.description).toBe("External Wallet")
    expect(item.payoutReview?.transfer_method).toBe("USDC on SOL")
  })
})

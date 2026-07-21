import { describe, expect, it, vi } from "vitest"

vi.mock("@easner/shared", () => ({
  deriveBankDepositInboundDisplayLabel: () => undefined,
  displayEasnerTransactionIdForList: (input: {
    easnerTransactionId?: string | null
    fallbackId?: string | null
  }) => input.easnerTransactionId || input.fallbackId || "",
  formatDisplayPersonName: (n: string) => n,
  formatOutboundTransferTitle: (
    recipientName?: string | null,
    fallbackRecipient = "Recipient",
  ) => `Transfer to ${recipientName || fallbackRecipient}`,
  formatTransactionDetailHeroTitle: ({
    direction,
    counterpartyName,
    productFallback,
  }: {
    direction: "in" | "out"
    counterpartyName?: string | null
    productFallback?: string | null
  }) =>
    direction === "out" && counterpartyName
      ? `Transfer to ${counterpartyName}`
      : productFallback,
  isBankOnrampDepositFlow: () => false,
  isVerificationDepositMetadata: () => false,
  isYcFundBalanceDepositMetadata: (meta?: Record<string, unknown> | null) =>
    String(meta?.yc_mode ?? "") === "fund_balance",
  isNoahVaFundingDeposit: () => false,
  resolveYcFundBalanceDepositDisplayTitle: () => undefined,
  resolveNoahVaFundingDepositTitleFromMeta: () => undefined,
  resolveInboundReceiveDetail: () => null,
  resolveLedgerWhenAt: (input: { occurredAt?: string | null; createdAt?: string | null }) =>
    input.occurredAt ?? input.createdAt ?? null,
  resolveAccountImpactAmount: (row: Record<string, unknown>) => ({
    amount: Number(row.ledger_amount ?? row.amount ?? 0),
    currency: String(row.ledger_currency ?? row.currency ?? "USD"),
  }),
  mapLedgerStatusForUserFeed: (st: string) => (st === "settled" ? "completed" : st),
  resolveYcPayInFeedStatus: (meta: Record<string, unknown> | null | undefined, ledgerStatus: string) => {
    const mode = String(meta?.yc_mode ?? "")
    if (
      (mode === "fund_balance" || mode === "cross_border_send") &&
      (ledgerStatus === "pending" || ledgerStatus === "processing")
    ) {
      return "processing_payment"
    }
    return null
  },
  ledgerTransactionStatusDisplayForRow: (ledgerStatus: string, meta?: Record<string, unknown> | null) => {
    const mode = String(meta?.yc_mode ?? "")
    const inFlight =
      (mode === "fund_balance" || mode === "cross_border_send") &&
      (ledgerStatus === "pending" || ledgerStatus === "processing")
    return {
      label: inFlight ? "Processing payment" : ledgerStatus === "settled" ? "Completed" : "Processing",
      tone: "processing" as const,
    }
  },
  resolveGlobalPayoutListDisplay: (row: Record<string, unknown>) => {
    const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
    if (String(meta.payout_type ?? "").toLowerCase() !== "global_fiat") return null
    return {
      displayAmount: Number(meta.receive_amount ?? row.amount ?? 0),
      displayCurrency: String(meta.receive_currency ?? row.currency ?? "USD"),
      ledgerAmount: Number(row.amount ?? 0),
      ledgerCurrency: String(row.currency ?? "USD"),
      displayDescription: `Transfer to ${meta.beneficiary_name ?? "Recipient"}`,
      displayHeroTitle: `Transfer to ${meta.beneficiary_name ?? "Recipient"}`,
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
      displayDescription: `Transfer to ${meta.counterparty_name ?? "External Wallet"}`,
      displayHeroTitle: `Transfer to ${meta.counterparty_name ?? "Wallet transfer"}`,
    }
  },
  resolveYcCrossBorderListDisplay: (row: Record<string, unknown>) => {
    const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
    if (String(meta.yc_mode ?? "") !== "cross_border_send") return null
    const snapshot =
      (meta.recipient_snapshot as Record<string, unknown> | undefined) ?? {}
    const recipientName = String(
      snapshot.full_name ?? meta.recipient_name ?? "Recipient",
    )
    const title = `Transfer to ${recipientName}`
    return {
      displayAmount: Number(meta.receive_amount ?? row.amount ?? 0),
      displayCurrency: String(meta.receive_currency ?? row.currency ?? "USD"),
      ledgerAmount: Number(row.amount ?? 0),
      ledgerCurrency: String(row.currency ?? "USD"),
      displayDescription: title,
      displayHeroTitle: title,
    }
  },
  toEasnerTransactionPrimaryLabel: () => "Bank Deposit",
  resolveTransactionTimingAnchors: () => ({
    startedAt: "2025-01-15T12:00:00.000Z",
    completedAt: null,
    failedAt: null,
  }),
  buildTransactionTimingRows: () => [],
  resolvePayoutReviewFlow: (meta?: Record<string, unknown> | null) =>
    meta && String(meta.yc_mode ?? "") === "cross_border_send" ? "local_pay_in" : "balance_payout",
  isYcPayInAwaitingAttestation: () => false,
  resolveYcPayInListWhenAt: () => null,
  readYcQuoteLockedAt: () => null,
  readYcPayInExpiresAt: () => null,
  isYcPayInFlowMetadata: (meta?: Record<string, unknown> | null) => {
    const mode = String(meta?.yc_mode ?? "")
    return mode === "fund_balance" || mode === "cross_border_send"
  },
  resolveYcPayInPaymentDetails: () => null,
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
    expect(item.description).toBe("Transfer to Jane Doe")
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
    expect(item.description).toBe("Transfer to External Wallet")
    expect(item.payoutReview?.transfer_method).toBe("USDC on SOL")
  })

  it("presents a YC balance pay-in as the amount credited", () => {
    const item = mapRowToBusinessTransaction({
      id: "db-uuid",
      provider: "yellowcard",
      status: "settled",
      amount: 65,
      currency: "USD",
      direction: "in",
      metadata: {
        yc_mode: "fund_balance",
        local_pay_in: 100000,
        local_currency: "NGN",
        usd_credit: 65,
      },
      created_at: "2025-01-15T12:00:00.000Z",
    })

    expect(item.amount).toBe(65)
    expect(item.displayCurrency).toBe("USD")
    expect(item.accountImpactAmount).toBe(65)
    expect(item.accountImpactCurrency).toBe("USD")
  })

  it("presents the destination amount for a YC cross-border send", () => {
    const item = mapRowToBusinessTransaction({
      id: "db-uuid",
      provider: "yellowcard",
      status: "pending",
      amount: 100000,
      currency: "NGN",
      direction: "out",
      metadata: {
        yc_mode: "cross_border_send",
        receive_amount: 900,
        receive_currency: "GHS",
        reporting_usd_amount: 65,
        recipient_name: "Legacy Recipient",
        recipient_snapshot: { full_name: "Ama Mensah" },
      },
      created_at: "2025-01-15T12:00:00.000Z",
    })

    expect(item.amount).toBe(900)
    expect(item.displayCurrency).toBe("GHS")
    expect(item.description).toBe("Transfer to Ama Mensah")
    expect(item.displayHeroTitle).toBe("Transfer to Ama Mensah")
    expect(item.status).toBe("processing_payment")
    expect(item.statusLabel).toBe("Processing payment")
  })
})

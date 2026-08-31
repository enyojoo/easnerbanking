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
  ) => recipientName || fallbackRecipient,
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
      ? counterpartyName
      : productFallback,
  isBankOnrampDepositFlow: () => false,
  isVerificationDepositMetadata: () => false,
  isYcFundBalanceDepositMetadata: (meta?: Record<string, unknown> | null) =>
    String(meta?.yc_mode ?? "") === "fund_balance",
  isVaFundingDeposit: () => false,
  resolveYcFundBalanceDepositDisplayTitle: () => undefined,
  resolveVaFundingDepositTitleFromMeta: () => undefined,
  resolveInboundReceiveDetail: () => null,
  isExpressDepositsMetadata: (meta?: Record<string, unknown> | null) =>
    String(meta?.flow ?? "") === "express_deposits",
  expressDepositActivityLabel: (method?: string) =>
    String(method || "").includes("apple") ? "Apple Pay deposit" : "Card deposit",
  buildExpressDepositsLifecycle: () => [],
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
      label: inFlight ? "Processing" : ledgerStatus === "settled" ? "Completed" : "Processing",
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
      displayDescription: String(meta.beneficiary_name ?? "Recipient"),
      displayHeroTitle: String(meta.beneficiary_name ?? "Recipient"),
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
      displayDescription: String(meta.counterparty_name ?? "External Wallet"),
      displayHeroTitle: String(meta.counterparty_name ?? "Wallet transfer"),
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
    const title = recipientName
    return {
      displayAmount: Number(meta.receive_amount ?? row.amount ?? 0),
      displayCurrency: String(meta.receive_currency ?? row.currency ?? "USD"),
      ledgerAmount: Number(row.amount ?? 0),
      ledgerCurrency: String(row.currency ?? "USD"),
      displayDescription: title,
      displayHeroTitle: title,
    }
  },
  resolveYcFundBalanceListDisplay: (row: Record<string, unknown>) => {
    const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
    if (String(meta.yc_mode ?? "") !== "fund_balance") return null
    const localPayIn = Number(meta.local_pay_in)
    const localCurrency = String(meta.local_currency ?? "").toUpperCase()
    if (!Number.isFinite(localPayIn) || localPayIn <= 0 || !localCurrency) return null
    return {
      displayAmount: localPayIn,
      displayCurrency: localCurrency,
      ledgerAmount: Number(meta.usd_credit ?? row.amount ?? 0),
      ledgerCurrency: String(row.currency ?? "USD"),
      displayDescription: "Nigeria Bank Deposit",
      displayHeroTitle: "Nigeria Bank Deposit",
    }
  },
  isRelayTronDepositMetadata: () => false,
  resolveRelayTronDepositListDisplay: () => null,
  walletSendUserFacingDisplayCurrency: (input: {
    receiveCurrency: string
    sendCurrency: string
    executionModel?: string | null
  }) => {
    const receive = String(input.receiveCurrency || "").trim().toUpperCase()
    const send = String(input.sendCurrency || "USD").trim().toUpperCase()
    const model = String(input.executionModel ?? "").trim().toLowerCase()
    if (receive === "USDC" && (send === "USD" || model === "direct_turnkey")) return "USD"
    if (receive === "EURC" && (send === "EUR" || model === "direct_turnkey")) return "EUR"
    return receive || send || "USD"
  },
  normalizeBalanceMoveReviewSnapshot: () => null,
  toEasnerTransactionPrimaryLabel: (input: {
    metadata?: Record<string, unknown> | null
  }) =>
    String(input.metadata?.source ?? "").toLowerCase() === "invoice_stripe"
      ? `Invoice #${String(input.metadata?.invoice_number ?? "")}`
      : "Bank Deposit",
  isStripeInvoiceSettlementMetadata: (meta?: Record<string, unknown> | null) =>
    String(meta?.source ?? "").toLowerCase() === "invoice_stripe",
  isStripeCollectionSettlementMetadata: (meta?: Record<string, unknown> | null) =>
    ["invoice_stripe", "checkout_stripe"].includes(String(meta?.source ?? "").toLowerCase()),
  inferStripeSettlementRail: (meta?: Record<string, unknown> | null) => {
    const rail = String(meta?.settlement_rail ?? "").toLowerCase()
    if (rail === "grid_va" || rail === "turnkey_stablecoin") return rail
    if (meta?.turnkey_inbound_matched === true) return "turnkey_stablecoin"
    if (
      String(meta?.stripe_connect_va_originator ?? "").toUpperCase() === "EASNER" ||
      String(meta?.grid_transaction_id ?? "").trim()
    ) {
      return "grid_va"
    }
    return null
  },
  stripeSettlementRailLabel: (rail: string | null) =>
    rail === "grid_va" ? "Bank account" : rail === "turnkey_stablecoin" ? "Stablecoin" : null,
  isStripeCollectionSettlementLifecycle: (lifecycle?: Array<{ id: string }> | null) =>
    Boolean(
      lifecycle?.some(
        (step) =>
          step.id === "payment_received" || step.id === "clearing" || step.id === "available",
      ),
    ),
  stripeCollectionSettlementTitle: (meta?: Record<string, unknown> | null) =>
    String(meta?.source ?? "").toLowerCase() === "invoice_stripe"
      ? `Invoice #${String(meta?.invoice_number ?? "")}`
      : String(meta?.headline ?? "") || "Online payment",
  buildStripeInvoiceSettlementLifecycle: () => [
    {
      id: "payment_received",
      title: "Payment received",
      description: "Customer paid the invoice.",
      state: "complete",
      occurredAt: "2026-08-04T15:18:03.588Z",
    },
    {
      id: "clearing",
      title: "Clearing",
      description: "Payout is clearing to your Easner account.",
      state: "upcoming",
      occurredAt: null,
    },
    {
      id: "available",
      title: "Available",
      description: "Funds credited to your balance.",
      state: "upcoming",
      occurredAt: null,
    },
  ],
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
    expect(item.displayCurrency).toBe("USD")
    expect(item.description).toBe("External Wallet")
    expect(item.payoutReview?.transfer_method).toBe("USDC on SOL")
  })

  it("presents a YC balance pay-in as local amount paid", () => {
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

    expect(item.amount).toBe(100000)
    expect(item.displayCurrency).toBe("NGN")
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
    expect(item.description).toBe("Ama Mensah")
    expect(item.displayHeroTitle).toBe("Ama Mensah")
    expect(item.status).toBe("processing_payment")
    expect(item.statusLabel).toBe("Processing")
  })

  it("maps Stripe invoice settlement title as Invoice #number (not Bank Deposit)", () => {
    const item = mapRowToBusinessTransaction({
      id: "27505420-c56c-4c1c-b47e-1f8b4a1f7440",
      easner_transaction_id: "ETID50120581",
      provider: "stripe",
      provider_transaction_id: "pi_3U0jXrFtxW9Zk3ZB1DzQTsZa",
      status: "processing",
      amount: 56888,
      currency: "USD",
      direction: "in",
      metadata: {
        source: "invoice_stripe",
        headline: "Invoice #EINV-C792A19D610A payment",
        fee_cents: 0,
        net_cents: 5688800,
        invoice_id: "775370a7-d508-4812-8488-ea59d938a9b2",
        gross_cents: 5688800,
        invoice_number: "EINV-C792A19D610A",
        settlement_phase: "payment_received",
        payment_method_type: "card",
        payment_method: {
          type: "card",
          brand: "visa",
          last4: "4242",
        },
        customer_email: "payer@example.com",
        customer_name: "Payer Name",
      },
      occurred_at: "2026-08-04T15:18:03.588Z",
      created_at: "2026-08-04T15:18:03.973Z",
    })

    expect(item.description).toBe("Invoice #EINV-C792A19D610A")
    expect(item.displayHeroTitle).toBe("Invoice #EINV-C792A19D610A")
    expect(item.paymentScheme).toBe("Visa •••• 4242")
    expect(item.stripePaymentMethod).toMatchObject({
      type: "card",
      brand: "visa",
      last4: "4242",
    })
    expect(item.customerEmail).toBe("payer@example.com")
    expect(item.customerName).toBe("Payer Name")
    expect(item.invoiceId).toBe("775370a7-d508-4812-8488-ea59d938a9b2")
    expect(item.reference).toBe("ETID50120581")
    expect(item.postedAmount).toBe(56888)
    expect(item.depositAmount).toBe(56888)
    expect(item.amount).toBe(56888)
    expect(item.fee).toBe(0)
    expect(item.lifecycle?.some((s) => s.id === "payment_received")).toBe(true)
  })

  it("keeps Stripe Connect invoices as book transfers after an on-chain sweep hash", () => {
    const item = mapRowToBusinessTransaction({
      id: "b27b7b76-0235-4291-a8cd-87c9104b2511",
      easner_transaction_id: "ETID94909659",
      provider: "stripe",
      provider_transaction_id: "pi_3U5WAmFtxW9Zk3ZB0C9YWvRi",
      status: "settled",
      amount: 1,
      currency: "USD",
      direction: "in",
      tx_hash: "2KsnZY5nJkGjasrFufMGJXoPLM12R8dbs8bk9GfU4ZGcshD7XBXoMjntXEnoZGqxk27oSrvV1bQDpVbCe5gTLHro",
      settled_at: "2026-08-19T10:43:21.545Z",
      metadata: {
        source: "invoice_stripe",
        headline: "Invoice #EINV-47929786BA35 payment",
        invoice_id: "48cd305d-5363-4580-8a7c-eb2178826de5",
        invoice_number: "EINV-47929786BA35",
        settlement_phase: "credited",
        credited_at: "2026-08-19T10:43:21.545Z",
        grid_transaction_id: "Transaction:01a0182e-5173-da6a-0000-d7235d231cb8",
        stripe_connect_va_originator: "EASNER",
        on_chain_settled_at: "2026-08-19T11:06:19.759Z",
        gross_cents: 100,
        net_cents: 100,
        fee_cents: 0,
      },
      created_at: "2026-08-17T19:26:20.012Z",
    })

    expect(item.type).toBe("book")
    expect(item.lifecycle?.some((s) => s.id === "payment_received")).toBe(true)
    expect(item.lifecycle?.some((s) => s.id === "available")).toBe(true)
    expect(item.settlementRailLabel).toBe("Bank account")
    expect(item.paymentRail).toBeUndefined()
  })

  it("keeps Stripe checkout and payment-link collections as book transfers after a hash", () => {
    const item = mapRowToBusinessTransaction({
      id: "uuid-checkout",
      easner_transaction_id: "ETID61951425",
      provider: "stripe",
      status: "settled",
      amount: 0.67,
      currency: "USD",
      direction: "in",
      tx_hash: "OnChainHashCheckout",
      metadata: {
        source: "checkout_stripe",
        headline: "Testing",
        collection_source: "link",
        settlement_phase: "credited",
        settlement_rail: "grid_va",
        fee_cents: 33,
        net_cents: 67,
        gross_cents: 100,
        collection_channel: "payment_link",
      },
      created_at: "2026-08-19T00:00:00.000Z",
    })

    expect(item.type).toBe("book")
    expect(item.lifecycle?.some((s) => s.id === "available")).toBe(true)
    expect(item.settlementRailLabel).toBe("Bank account")
  })

  it("lists Stripe collection payment amount (gross), not net credited", () => {
    const item = mapRowToBusinessTransaction({
      id: "uuid-checkout",
      easner_transaction_id: "ETID61951425",
      provider: "stripe",
      status: "settled",
      amount: 0.67,
      currency: "USD",
      direction: "in",
      metadata: {
        source: "checkout_stripe",
        headline: "Testing",
        fee_cents: 33,
        net_cents: 67,
        gross_cents: 100,
        collection_channel: "payment_link",
      },
      created_at: "2026-08-19T00:00:00.000Z",
    })

    expect(item.amount).toBe(1)
    expect(item.depositAmount).toBe(1)
    expect(item.postedAmount).toBe(0.67)
    expect(item.fee).toBe(0.33)
    expect(item.accountImpactAmount).toBe(0.67)
  })
})

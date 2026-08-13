import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

const listGridRates = vi.fn()
const gridFetch = vi.fn()
const ensureGridCustomer = vi.fn()
const createGridExternalAccount = vi.fn()
const loadGridRecipientBankCandidates = vi.fn()
const upsertLedger = vi.fn()

vi.mock("@/lib/fx/grid-rates", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fx/grid-rates")>("@/lib/fx/grid-rates")
  return {
    ...actual,
    listGridRates: (...args: unknown[]) => listGridRates(...args),
  }
})

vi.mock("./http", () => ({
  gridFetch: (...args: unknown[]) => gridFetch(...args),
}))

vi.mock("./ensure-grid-customer", () => ({
  ensureGridCustomer: (...args: unknown[]) => ensureGridCustomer(...args),
}))

vi.mock("./external-account", async () => {
  const actual = await vi.importActual<typeof import("./external-account")>("./external-account")
  return {
    ...actual,
    createGridExternalAccount: (...args: unknown[]) => createGridExternalAccount(...args),
  }
})

vi.mock("./grid-bank-candidates", () => ({
  loadGridRecipientBankCandidates: (...args: unknown[]) => loadGridRecipientBankCandidates(...args),
}))

vi.mock("@/lib/pay-in-limit-check", () => ({
  validateFundBalancePayInAmountLimits: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock("@/lib/processing-fee/quote-processing-fee-bps", () => ({
  quoteFiatProcessingFeeBps: vi.fn().mockResolvedValue(0),
  recipientPayoutRail: () => "bank_transfer",
}))

vi.mock("./config", () => ({
  getGridQuoteTtlMs: () => 60_000,
}))

vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: (...args: unknown[]) => upsertLedger(...args),
}))

import {
  previewGridCrossBorderQuote,
  createGridCrossBorderQuote,
  confirmGridCrossBorderTransfer,
} from "./cross-border-orchestrator"
import { handleGridCrossBorderSendWebhook } from "./webhook-processor"

const rateRow = (from: string, to: string, rate: number) => ({
  from_currency: from,
  to_currency: to,
  country_code: null,
  grid_mid: rate,
  rate,
  margin_bps: 0,
  source: "test",
  as_of: new Date().toISOString(),
  status: "active",
})

function corridorQuery() {
  const api: Record<string, unknown> = {}
  api.select = () => api
  api.eq = () => api
  api.limit = async () => ({
    data: [{ metadata: { grid_receive: true, grid_receive_enabled: true }, enabled: true }],
  })
  return api
}

function makePreviewAdmin(): SupabaseClient {
  return {
    from: () => corridorQuery(),
  } as unknown as SupabaseClient
}

function makeCreateAdmin(insertedId = "tr-1"): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === "payout_corridors") return corridorQuery()
      const api: Record<string, unknown> = {}
      api.insert = () => api
      api.select = () => api
      api.single = async () => ({ data: { id: insertedId }, error: null })
      return api
    },
  } as unknown as SupabaseClient
}

const recipient: RecipientSellPrepareRow = {
  country_code: "KE",
  full_name: "Jane Doe",
  account_number: "1234567890",
  bank_name: "Equity Bank",
  currency: "KES",
}

const profile = { fullName: "Org Owner", email: "owner@example.com" }

const baseInput = {
  userId: "user-1",
  businessId: "biz-1",
  sourceCountry: "UG",
  sourceCurrency: "UGX",
  recipient,
  receiveAmount: 1000,
  profile,
}

describe("grid cross-border orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listGridRates.mockResolvedValue([
      rateRow("UGX", "USD", 0.00027),
      rateRow("USD", "UGX", 3700),
      rateRow("KES", "USD", 0.0077),
      rateRow("USD", "KES", 129),
      rateRow("UGX", "KES", 0.035),
    ])
    ensureGridCustomer.mockResolvedValue({ customerId: "Customer:abc" })
    createGridExternalAccount.mockResolvedValue({ id: "ext-1" })
    loadGridRecipientBankCandidates.mockResolvedValue({ bankNames: ["Equity Bank"], momoProviders: [] })
    gridFetch.mockResolvedValue({
      id: "Quote:q1",
      exchangeRate: 0.035,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      paymentInstructions: { accountOrWalletInfo: { accountNumber: "VA-1" } },
    })
  })

  it("preview uses DB rates and does not call Grid HTTP", async () => {
    const preview = await previewGridCrossBorderQuote({
      ...baseInput,
      admin: makePreviewAdmin(),
    })
    expect(preview.ok).toBe(true)
    expect(preview.quotePhase).toBe("preview")
    expect(preview.receiveAmount).toBe(1000)
    expect(gridFetch).not.toHaveBeenCalled()
    expect(listGridRates).toHaveBeenCalled()
  })

  it("create locks a Grid quote via POST /quotes", async () => {
    const locked = await createGridCrossBorderQuote({
      ...baseInput,
      admin: makeCreateAdmin("tr-lock"),
    })
    expect(locked.quoteId).toBe("Quote:q1")
    expect(locked.externalAccountId).toBe("ext-1")
    expect(gridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/quotes",
      }),
    )
  })

  it("confirm promotes the transfer to awaiting_pay_in with payment instructions", async () => {
    const transfer = {
      id: "tr-lock",
      quoted_pay_in: 28571,
      quoted_receive: 1000,
      pay_in_currency: "UGX",
      receive_currency: "KES",
      customer_rate: 0.035,
      expires_at: new Date().toISOString(),
      metadata: { easner_transaction_id: "ETX1" },
      settlement_info: { paymentInstructions: { accountOrWalletInfo: { accountNumber: "VA-1" } } },
    }
    const updates: Array<{ status?: string }> = []
    const admin = {
      from: (table: string) => {
        const api: Record<string, unknown> = {}
        api.select = () => api
        api.eq = () => api
        api.maybeSingle = async () => {
          if (table === "grid_transfers") return { data: transfer, error: null }
          return { data: { id: "tx-1" }, error: null }
        }
        api.insert = () => api
        api.update = (patch: { status?: string }) => {
          updates.push(patch)
          return api
        }
        return api
      },
    } as unknown as SupabaseClient

    const confirmed = await confirmGridCrossBorderTransfer({
      admin,
      userId: "user-1",
      businessId: "biz-1",
      quoteId: "Quote:q1",
    })
    expect(confirmed.transactionId).toBe("tx-1")
    expect(confirmed.bankInfo).toEqual({ accountNumber: "VA-1" })
    expect(updates.some((u) => u.status === "awaiting_pay_in")).toBe(true)
  })

  it("lock-leg2 shim keeps the same Grid quote id", async () => {
    const locked = await createGridCrossBorderQuote({
      ...baseInput,
      admin: makeCreateAdmin("tr-lock"),
    })
    expect(locked.quoteId).toBe("Quote:q1")
    expect(locked.sequenceId).toContain("grid_xb_")
  })

  it("webhooks move INCOMING → processing and OUTGOING → settled", async () => {
    const transfer = {
      id: "tr-1",
      transaction_id: "tx-1",
      status: "awaiting_pay_in",
      pay_in_currency: "UGX",
      metadata: {},
    }
    const tx = {
      id: "tx-1",
      user_id: "user-1",
      business_id: "biz-1",
      metadata: {},
      amount: 100,
      provider: "grid",
      provider_transaction_id: "Quote:q1",
    }
    const admin = {
      from: (table: string) => {
        const api: Record<string, unknown> = {}
        api.select = () => api
        api.eq = () => api
        api.maybeSingle = async () => ({
          data: table === "grid_transfers" ? transfer : tx,
          error: null,
        })
        api.update = () => api
        return api
      },
    } as unknown as SupabaseClient

    const incoming = await handleGridCrossBorderSendWebhook(admin, {
      event: { eventType: "INCOMING_PAYMENT.COMPLETED", data: { quoteId: "Quote:q1", status: "COMPLETED" } },
      quoteId: "Quote:q1",
      status: "COMPLETED",
    })
    expect(incoming).toEqual({ handled: true })
    expect(upsertLedger).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ status: "processing" }),
    )

    upsertLedger.mockClear()
    const outgoing = await handleGridCrossBorderSendWebhook(admin, {
      event: { eventType: "OUTGOING_PAYMENT.COMPLETED", data: { quoteId: "Quote:q1", status: "COMPLETED" } },
      quoteId: "Quote:q1",
      status: "COMPLETED",
    })
    expect(outgoing).toEqual({ handled: true })
    expect(upsertLedger).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ status: "settled" }),
    )
  })
})

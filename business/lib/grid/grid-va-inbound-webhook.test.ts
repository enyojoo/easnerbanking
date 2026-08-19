import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { handleGridVaInboundDepositWebhook } from "./grid-va-inbound-webhook"

const mockUpsert = vi.fn().mockResolvedValue({ transactionId: "tx-1" })
const mockCredit = vi.fn().mockResolvedValue({ credited: true })
const mockReconcile = vi.fn().mockResolvedValue({ credited: true })

vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: (...args: unknown[]) => mockUpsert(...args),
}))

vi.mock("./grid-bank-deposit-credit", () => ({
  tryCreditGridVaBankDepositWallet: (...args: unknown[]) => mockCredit(...args),
  reconcileGridVaBankDepositCreditForSolanaTx: (...args: unknown[]) => mockReconcile(...args),
}))

const mockSweep = vi.fn().mockResolvedValue({ ok: true })
vi.mock("./va-turnkey-sweep", () => ({
  startGridVaTurnkeySweepFromInbound: (...args: unknown[]) => mockSweep(...args),
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId: vi.fn().mockResolvedValue("owner-user"),
}))

function makeAdmin(businessId: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: businessId ? { id: businessId } : null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as SupabaseClient
}

describe("handleGridVaInboundDepositWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates a bank on-ramp ledger row and credits wallet for business VA inbound", async () => {
    const admin = makeAdmin("biz-1")
    const handled = await handleGridVaInboundDepositWebhook(admin, {
      event: {
        eventType: "INCOMING_PAYMENT.COMPLETED",
        data: {
          id: "Transaction:abc",
          customerId: "Customer:grid-1",
          status: "COMPLETED",
          receivedAmount: { amount: 25000, currency: { code: "USD", decimals: 2 } },
        },
      },
    })

    expect(handled).toEqual({ handled: true })
    expect(mockUpsert).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        businessId: "biz-1",
        provider: "grid",
        providerTransactionId: "Transaction:abc",
        direction: "in",
        metadata: expect.objectContaining({
          flow: "bank_onramp",
          grid_va_inbound: true,
          deposit_kind: "funding",
          fee_amount: 0,
        }),
      }),
    )
    expect(mockCredit).toHaveBeenCalled()
    expect(mockSweep).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ ledgerTransactionId: "tx-1" }),
    )
  })

  it("is idempotent when wallet credit already applied", async () => {
    mockCredit.mockResolvedValueOnce({ credited: false, skippedReason: "already_credited" })
    const admin = makeAdmin("biz-1")
    const handled = await handleGridVaInboundDepositWebhook(admin, {
      event: {
        eventType: "INCOMING_PAYMENT.COMPLETED",
        data: {
          id: "Transaction:abc",
          customerId: "Customer:grid-1",
          status: "COMPLETED",
          receivedAmount: { amount: 25000, currency: { code: "USD", decimals: 2 } },
        },
      },
    })
    expect(handled).toEqual({ handled: true })
    expect(mockUpsert).toHaveBeenCalled()
    expect(mockCredit).toHaveBeenCalled()
    expect(mockSweep).toHaveBeenCalled()
  })

  it("classifies sub-$1 inbound as verification and skips credit and sweep", async () => {
    const admin = makeAdmin("biz-1")
    const handled = await handleGridVaInboundDepositWebhook(admin, {
      event: {
        eventType: "INCOMING_PAYMENT.COMPLETED",
        data: {
          id: "Transaction:verify",
          customerId: "Customer:grid-1",
          status: "COMPLETED",
          senderName: "Chase",
          paymentRail: "ACH",
          receivedAmount: { amount: 32, currency: { code: "USD", decimals: 2 } },
        },
      },
    })
    expect(handled).toEqual({ handled: true })
    expect(mockUpsert).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        metadata: expect.objectContaining({
          deposit_kind: "verification",
          sender_name: "Chase",
          source_payment_rail: "ach",
        }),
      }),
    )
    expect(mockCredit).not.toHaveBeenCalled()
    expect(mockSweep).not.toHaveBeenCalled()
    expect(mockReconcile).not.toHaveBeenCalled()
  })

  it("ignores events without a resolvable business", async () => {
    const admin = makeAdmin(null)
    const handled = await handleGridVaInboundDepositWebhook(admin, {
      event: {
        eventType: "INCOMING_PAYMENT.COMPLETED",
        data: {
          id: "Transaction:abc",
          customerId: "Customer:missing",
          status: "COMPLETED",
          receivedAmount: { amount: 100, currency: { code: "USD", decimals: 2 } },
        },
      },
    })
    expect(handled).toEqual({ handled: false })
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

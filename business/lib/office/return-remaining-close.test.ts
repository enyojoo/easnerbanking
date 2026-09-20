import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const mocks = vi.hoisted(() => ({
  createTurnkeySend: vi.fn(),
  applyWalletBalanceDelta: vi.fn(),
  applyAccountRestriction: vi.fn(),
  resolveNoahAccountContextFromLedgerScope: vi.fn(),
  resolveBusinessOrgOwnerUserId: vi.fn(),
}))

vi.mock("@/lib/turnkey/send", () => ({
  createTurnkeySend: mocks.createTurnkeySend,
}))
vi.mock("@/lib/wallet/wallet-balances-db", () => ({
  applyWalletBalanceDelta: mocks.applyWalletBalanceDelta,
}))
vi.mock("@/lib/account-restriction", () => ({
  applyAccountRestriction: mocks.applyAccountRestriction,
}))
vi.mock("@/lib/processing-fee/capture-pending-processing-fee", () => ({
  resolveNoahAccountContextFromLedgerScope: mocks.resolveNoahAccountContextFromLedgerScope,
}))
vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId: mocks.resolveBusinessOrgOwnerUserId,
}))

import { OfficeReturnError, officeReturnRemaining } from "./return-remaining-close"

const DEST = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"

function makeAdmin(opts: {
  user?: Record<string, unknown> | null
  business?: Record<string, unknown> | null
  available?: number
  ledger?: { id: string; metadata?: Record<string, unknown> } | null
}) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = []
  const admin = {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      chain.select = self
      chain.eq = self
      chain.is = self
      chain.limit = self
      chain.maybeSingle = async () => {
        if (table === "users") return { data: opts.user ?? null, error: null }
        if (table === "businesses") return { data: opts.business ?? null, error: null }
        if (table === "wallet_balances") {
          return { data: { available_balance: opts.available ?? 0 }, error: null }
        }
        if (table === "transactions") return { data: opts.ledger ?? null, error: null }
        return { data: null, error: null }
      }
      chain.update = (payload: Record<string, unknown>) => {
        updates.push({ table, payload })
        return chain
      }
      return chain
    },
  }
  return { admin: admin as unknown as SupabaseClient, updates }
}

const ctx = {
  scope: "individual",
  customerType: "Individual",
  noahCustomerId: "noah_user",
  subjectBusinessId: null,
  subjectUserId: "user-1",
}

describe("officeReturnRemaining", () => {
  beforeEach(() => {
    mocks.createTurnkeySend.mockReset()
    mocks.applyWalletBalanceDelta.mockReset()
    mocks.applyAccountRestriction.mockReset()
    mocks.resolveNoahAccountContextFromLedgerScope.mockReset()
    mocks.resolveBusinessOrgOwnerUserId.mockReset()
    mocks.createTurnkeySend.mockResolvedValue({
      status: "settled",
      providerTransactionId: "tk_1",
      txHash: "sig_1",
      chainFailureDetail: null,
    })
    mocks.applyWalletBalanceDelta.mockResolvedValue(undefined)
    mocks.resolveNoahAccountContextFromLedgerScope.mockResolvedValue(ctx)
    mocks.resolveBusinessOrgOwnerUserId.mockResolvedValue("owner-1")
  })

  it("sends from the user vault and debits without closing", async () => {
    const { admin, updates } = makeAdmin({
      user: { id: "user-1", role: "individual", easner_business_id: null },
      available: 40,
      ledger: { id: "txn_1", metadata: { source: "turnkey_send" } },
    })

    const result = await officeReturnRemaining(admin, {
      kind: "user",
      subjectId: "user-1",
      operatorAdminId: "admin-1",
      reason: "Fraud return",
      destinationAddress: DEST,
      amount: 40,
      currency: "USD",
    })

    expect(result.ok).toBe(true)
    expect(result.asset).toBe("USDC")
    expect(mocks.createTurnkeySend).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        asset: "USDC",
        chain: "solana",
        destinationAddress: DEST,
        amount: 40,
      }),
    )
    expect(mocks.applyWalletBalanceDelta).toHaveBeenCalledWith(admin, {
      businessId: null,
      userId: "user-1",
      currency: "USD",
      delta: -40,
    })
    expect(mocks.applyAccountRestriction).not.toHaveBeenCalled()
    expect(updates.some((u) => u.table === "transactions")).toBe(true)
  })

  it("sends from the business vault, not the owner personal wallet", async () => {
    const { admin } = makeAdmin({
      business: { id: "biz-1" },
      available: 12.5,
    })
    mocks.resolveNoahAccountContextFromLedgerScope.mockResolvedValue({
      ...ctx,
      scope: "business",
      customerType: "Business",
      subjectBusinessId: "biz-1",
      subjectUserId: "owner-1",
    })

    await officeReturnRemaining(admin, {
      kind: "business",
      subjectId: "biz-1",
      operatorAdminId: "admin-1",
      reason: "Wind-down remainder",
      destinationAddress: DEST,
      amount: 12.5,
      currency: "EUR",
    })

    expect(mocks.resolveBusinessOrgOwnerUserId).toHaveBeenCalledWith(admin, "biz-1")
    expect(mocks.createTurnkeySend).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ asset: "EURC", amount: 12.5 }),
    )
    expect(mocks.applyWalletBalanceDelta).toHaveBeenCalledWith(admin, {
      businessId: "biz-1",
      userId: null,
      currency: "EUR",
      delta: -12.5,
    })
    expect(mocks.applyAccountRestriction).not.toHaveBeenCalled()
  })

  it("does not debit when the vault send fails", async () => {
    mocks.createTurnkeySend.mockResolvedValue({
      status: "failed",
      providerTransactionId: "tk_fail",
      txHash: null,
      chainFailureDetail: "broadcast failed",
    })
    const { admin } = makeAdmin({
      user: { id: "user-1", role: "individual", easner_business_id: null },
      available: 10,
    })

    await expect(
      officeReturnRemaining(admin, {
        kind: "user",
        subjectId: "user-1",
        operatorAdminId: "admin-1",
        reason: "Fraud",
        destinationAddress: DEST,
        amount: 10,
        currency: "USD",
      }),
    ).rejects.toMatchObject({ message: "broadcast failed", status: 502 })

    expect(mocks.applyWalletBalanceDelta).not.toHaveBeenCalled()
    expect(mocks.applyAccountRestriction).not.toHaveBeenCalled()
  })

  it("rejects an amount above remaining", async () => {
    const { admin } = makeAdmin({
      user: { id: "user-1", role: "individual", easner_business_id: null },
      available: 5,
    })

    await expect(
      officeReturnRemaining(admin, {
        kind: "user",
        subjectId: "user-1",
        operatorAdminId: "admin-1",
        reason: "Fraud",
        destinationAddress: DEST,
        amount: 6,
        currency: "USD",
      }),
    ).rejects.toBeInstanceOf(OfficeReturnError)
    expect(mocks.createTurnkeySend).not.toHaveBeenCalled()
  })

  it("rejects org-linked user profiles", async () => {
    const { admin } = makeAdmin({
      user: { id: "user-1", role: "business", easner_business_id: "biz-1" },
      available: 20,
    })

    await expect(
      officeReturnRemaining(admin, {
        kind: "user",
        subjectId: "user-1",
        operatorAdminId: "admin-1",
        reason: "Fraud",
        destinationAddress: DEST,
        amount: 20,
        currency: "USD",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("business profile"),
    })
    expect(mocks.createTurnkeySend).not.toHaveBeenCalled()
  })

  it("rejects a missing reason or invalid destination", async () => {
    const { admin } = makeAdmin({
      user: { id: "user-1", role: "individual", easner_business_id: null },
      available: 20,
    })

    await expect(
      officeReturnRemaining(admin, {
        kind: "user",
        subjectId: "user-1",
        operatorAdminId: "admin-1",
        reason: "  ",
        destinationAddress: DEST,
        amount: 1,
        currency: "USD",
      }),
    ).rejects.toMatchObject({ message: "Reason is required" })

    await expect(
      officeReturnRemaining(admin, {
        kind: "user",
        subjectId: "user-1",
        operatorAdminId: "admin-1",
        reason: "Fraud",
        destinationAddress: "not-an-address",
        amount: 1,
        currency: "USD",
      }),
    ).rejects.toMatchObject({ message: "Enter a Solana address" })
    expect(mocks.createTurnkeySend).not.toHaveBeenCalled()
  })
})

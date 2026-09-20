import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  adjust: vi.fn(),
  insertTxn: vi.fn(),
  webhook: vi.fn(),
  outbound: vi.fn(),
}))

vi.mock("@/lib/business-app-public-url", () => ({
  getBusinessAppPublicOrigin: () => "https://business.easner.com",
}))
vi.mock("@/lib/checkout/merchant-webhooks", () => ({
  dispatchMerchantWebhook: mocks.webhook,
}))
vi.mock("@/lib/platform/ledger", () => ({
  adjustPlatformAccount: mocks.adjust,
  insertPlatformTransaction: mocks.insertTxn,
}))
vi.mock("@/lib/platform/send-rails", () => ({
  executePlatformOutboundRail: mocks.outbound,
}))

import { hashCheckoutSecretKey } from "@/lib/checkout/secrets"
import { createPlatformTransfer, publicTransfer } from "./objects"
import {
  cancelPlatformTransfer,
  confirmPlatformTransfer,
  destinationSummary,
  merchantTriedToConfirm,
  readTransferClientSecret,
  reviewPlatformTransfer,
} from "./transfer-authorize"

const TEST_SECRET = `easner_ta_test_${"ab".repeat(24)}`
const LIVE_SECRET = `easner_ta_live_${"cd".repeat(24)}`

function memoryAdmin(seed: Record<string, Record<string, unknown>[]>) {
  const db: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    Object.entries(seed).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]),
  )
  return {
    from(table: string) {
      const rows = () => (db[table] ??= [])
      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      let mode: "select" | "insert" | "update" = "select"
      let payload: Record<string, unknown> | null = null
      const matched = () => rows().filter((row) => filters.every((fn) => fn(row)))
      const api: {
        select: () => typeof api
        eq: (col: string, val: unknown) => typeof api
        insert: (row: Record<string, unknown>) => typeof api
        update: (row: Record<string, unknown>) => typeof api
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
      } = {
        select: () => api,
        eq: (col: string, val: unknown) => {
          filters.push((row) => row[col] === val)
          return api
        },
        insert: (row: Record<string, unknown>) => {
          mode = "insert"
          payload = row
          return api
        },
        update: (row: Record<string, unknown>) => {
          mode = "update"
          payload = row
          return api
        },
        maybeSingle: async () => {
          if (mode === "insert" && payload) {
            rows().push(payload)
            return { data: payload }
          }
          if (mode === "update" && payload) {
            const hit = matched()[0]
            if (!hit) return { data: null }
            Object.assign(hit, payload)
            return { data: hit }
          }
          return { data: matched()[0] ?? null }
        },
        single: async () => {
          const result = await api.maybeSingle()
          if (!result.data) return { data: null, error: { message: "not found" } }
          return { data: result.data, error: null }
        },
      }
      return api
    },
  }
}

function openTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: "tr_1",
    business_id: "biz-1",
    livemode: false,
    quote_id: "qt_1",
    source_account_id: "acct_1",
    destination_id: "dest_1",
    amount_cents: 4900,
    currency: "USD",
    status: "requires_action",
    customer_id: "cus_1",
    client_secret_hash: hashCheckoutSecretKey(TEST_SECRET),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    ...overrides,
  }
}

describe("destinationSummary", () => {
  it("masks bank, wallet, and mobile money", () => {
    expect(destinationSummary("bank", { account_number: "000123456789" })).toEqual({
      type: "bank",
      label: "Bank ···6789",
    })
    expect(destinationSummary("wallet", { address: "So11111111111111111111111111111111111111112" })).toEqual({
      type: "wallet",
      label: "Wallet ···1112",
    })
    expect(destinationSummary("mobile_money", { phone: "+254700000123" })).toEqual({
      type: "mobile_money",
      label: "Mobile money ···0123",
    })
    expect(destinationSummary("easetag", { easetag: "ada" })).toEqual({ type: "easetag", label: "@ada" })
  })
})

describe("confirm auth helpers", () => {
  it("rejects a merchant secret key on confirm", () => {
    expect(merchantTriedToConfirm("Bearer easner_sk_test_abc")).toBe(true)
    expect(merchantTriedToConfirm(`Bearer ${TEST_SECRET}`)).toBe(false)
    expect(merchantTriedToConfirm(null)).toBe(false)
  })

  it("reads client_secret from body, query, or bearer", () => {
    expect(readTransferClientSecret({ bodySecret: TEST_SECRET })).toBe(TEST_SECRET)
    expect(readTransferClientSecret({ querySecret: TEST_SECRET })).toBe(TEST_SECRET)
    expect(readTransferClientSecret({ authorizationHeader: `Bearer ${TEST_SECRET}` })).toBe(TEST_SECRET)
    expect(readTransferClientSecret({ authorizationHeader: "Bearer easner_sk_test_abc" })).toBe("")
  })
})

describe("publicTransfer", () => {
  it("returns next_action and client_secret only when passed", () => {
    const row = {
      id: "tr_1",
      amount_cents: 4900,
      currency: "USD",
      status: "requires_action",
      livemode: false,
      created_at: "2026-09-20T00:00:00.000Z",
      expires_at: "2026-09-20T00:15:00.000Z",
    }
    expect(publicTransfer(row).client_secret).toBeUndefined()
    expect(publicTransfer(row).next_action).toEqual({
      type: "authorize",
      url: "https://business.easner.com/send/authorize/tr_1",
    })
    expect(publicTransfer(row, { clientSecret: TEST_SECRET })).toMatchObject({
      client_secret: TEST_SECRET,
      next_action: {
        type: "authorize",
        url: `https://business.easner.com/send/authorize/tr_1?client_secret=${encodeURIComponent(TEST_SECRET)}`,
      },
    })
    expect(publicTransfer({ ...row, status: "completed" }).next_action).toBeNull()
  })
})

describe("createPlatformTransfer", () => {
  beforeEach(() => {
    mocks.adjust.mockReset().mockResolvedValue({})
    mocks.webhook.mockReset().mockResolvedValue(undefined)
    mocks.insertTxn.mockReset()
    mocks.outbound.mockReset()
  })

  it("locks available into pending and returns requires_action plus client_secret", async () => {
    const admin = memoryAdmin({
      platform_accounts: [
        { id: "acct_1", customer_id: "cus_1", wallet_owner_id: "wo_1", business_id: "biz-1", livemode: false },
      ],
      platform_transfers: [],
    })
    const created = await createPlatformTransfer(admin as never, {
      businessId: "biz-1",
      livemode: false,
      sourceAccountId: "acct_1",
      destinationId: "dest_1",
      amountCents: 4900,
      currency: "USD",
    })
    expect(created.status).toBe("requires_action")
    expect(created.client_secret).toMatch(/^easner_ta_test_[0-9a-f]+$/)
    expect(created.next_action?.type).toBe("authorize")
    expect(mocks.adjust).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ accountId: "acct_1", availableDelta: -4900, pendingDelta: 4900 }),
    )
    expect(mocks.outbound).not.toHaveBeenCalled()
    expect(mocks.webhook).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ event: "transfer.created", data: expect.objectContaining({ status: "requires_action" }) }),
    )
    expect(mocks.webhook.mock.calls[0][1].data.client_secret).toBeUndefined()
  })

  it("creates a live transfer without sending", async () => {
    const admin = memoryAdmin({
      platform_accounts: [
        { id: "acct_1", customer_id: "cus_1", wallet_owner_id: "wo_1", business_id: "biz-1", livemode: true },
      ],
      platform_transfers: [],
    })
    const created = await createPlatformTransfer(admin as never, {
      businessId: "biz-1",
      livemode: true,
      sourceAccountId: "acct_1",
      destinationId: "dest_1",
      amountCents: 4900,
      currency: "USD",
    })
    expect(created.status).toBe("requires_action")
    expect(created.client_secret).toMatch(/^easner_ta_live_/)
    expect(mocks.outbound).not.toHaveBeenCalled()
  })
})

describe("confirmPlatformTransfer", () => {
  beforeEach(() => {
    mocks.adjust.mockReset().mockResolvedValue({})
    mocks.webhook.mockReset().mockResolvedValue(undefined)
    mocks.insertTxn.mockReset().mockResolvedValue({ id: "txn_1" })
    mocks.outbound.mockReset().mockResolvedValue(undefined)
  })

  it("confirms the test book without calling outbound rails", async () => {
    const admin = memoryAdmin({
      platform_transfers: [openTransfer()],
      platform_accounts: [{ id: "acct_1", wallet_owner_id: "wo_1", customer_id: "cus_1" }],
    })
    const completed = await confirmPlatformTransfer(admin as never, {
      transferId: "tr_1",
      clientSecret: TEST_SECRET,
    })
    expect(completed.status).toBe("completed")
    expect(mocks.outbound).not.toHaveBeenCalled()
    expect(mocks.adjust).toHaveBeenCalledWith(admin, { accountId: "acct_1", pendingDelta: -4900 })
    expect(mocks.insertTxn).toHaveBeenCalled()
    expect(mocks.webhook).toHaveBeenCalledWith(admin, expect.objectContaining({ event: "transfer.completed" }))
  })

  it("is idempotent after complete", async () => {
    const admin = memoryAdmin({
      platform_transfers: [openTransfer({ status: "completed" })],
    })
    const completed = await confirmPlatformTransfer(admin as never, {
      transferId: "tr_1",
      clientSecret: TEST_SECRET,
    })
    expect(completed.status).toBe("completed")
    expect(mocks.adjust).not.toHaveBeenCalled()
    expect(mocks.outbound).not.toHaveBeenCalled()
  })

  it("rejects a wrong secret", async () => {
    const admin = memoryAdmin({ platform_transfers: [openTransfer()] })
    await expect(
      confirmPlatformTransfer(admin as never, {
        transferId: "tr_1",
        clientSecret: `easner_ta_test_${"ff".repeat(24)}`,
      }),
    ).rejects.toMatchObject({ code: "not_found" })
    expect(mocks.adjust).not.toHaveBeenCalled()
  })

  it("expires and releases the hold", async () => {
    const admin = memoryAdmin({
      platform_transfers: [openTransfer({ expires_at: new Date(Date.now() - 1000).toISOString() })],
    })
    await expect(
      confirmPlatformTransfer(admin as never, { transferId: "tr_1", clientSecret: TEST_SECRET }),
    ).rejects.toMatchObject({ code: "transfer_expired" })
    expect(mocks.adjust).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ accountId: "acct_1", availableDelta: 4900, pendingDelta: -4900 }),
    )
  })

  it("sends live rails then settles pending", async () => {
    const admin = memoryAdmin({
      platform_transfers: [
        openTransfer({
          livemode: true,
          client_secret_hash: hashCheckoutSecretKey(LIVE_SECRET),
        }),
      ],
      platform_accounts: [{ id: "acct_1", wallet_owner_id: "wo_1", customer_id: "cus_1" }],
    })
    const completed = await confirmPlatformTransfer(admin as never, {
      transferId: "tr_1",
      clientSecret: LIVE_SECRET,
    })
    expect(completed.status).toBe("completed")
    expect(mocks.outbound).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        businessId: "biz-1",
        customerId: "cus_1",
        destinationId: "dest_1",
        walletOwnerId: "wo_1",
        amountCents: 4900,
      }),
    )
  })
})

describe("cancel and review", () => {
  beforeEach(() => {
    mocks.adjust.mockReset().mockResolvedValue({})
    mocks.webhook.mockReset()
  })

  it("cancels an open transfer and releases the hold", async () => {
    const admin = memoryAdmin({ platform_transfers: [openTransfer()] })
    const canceled = await cancelPlatformTransfer(admin as never, {
      businessId: "biz-1",
      livemode: false,
      transferId: "tr_1",
    })
    expect(canceled.status).toBe("canceled")
    expect(mocks.adjust).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ availableDelta: 4900, pendingDelta: -4900 }),
    )
  })

  it("returns a destination summary for the authorize secret", async () => {
    const admin = memoryAdmin({
      platform_transfers: [openTransfer()],
      platform_destinations: [{ id: "dest_1", type: "easetag", details: { easetag: "ada" } }],
    })
    const review = await reviewPlatformTransfer(admin as never, {
      transferId: "tr_1",
      clientSecret: TEST_SECRET,
    })
    expect(review.destination_summary).toEqual({ type: "easetag", label: "@ada" })
    expect(review.client_secret).toBeUndefined()
  })
})

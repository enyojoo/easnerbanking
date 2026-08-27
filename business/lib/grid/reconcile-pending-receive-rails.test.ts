import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  hasActiveGridVirtualAccountForBusinessInDb,
  getWalletOwnerId,
  resolveBusinessOrgOwnerUserId,
  refreshGridBusinessReceiveRails,
} = vi.hoisted(() => ({
  hasActiveGridVirtualAccountForBusinessInDb: vi.fn(),
  getWalletOwnerId: vi.fn(),
  resolveBusinessOrgOwnerUserId: vi.fn(),
  refreshGridBusinessReceiveRails: vi.fn(),
}))

vi.mock("@/lib/noah/virtual-accounts-db", () => ({
  hasActiveGridVirtualAccountForBusinessInDb,
}))

vi.mock("@/lib/wallet/resolve-wallet-owner", () => ({
  getWalletOwnerId,
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId,
}))

vi.mock("@/lib/grid/provision-after-approval", () => ({
  refreshGridBusinessReceiveRails,
}))

import { reconcilePendingGridBusinessReceiveRails } from "./reconcile-pending-receive-rails"

describe("reconcilePendingGridBusinessReceiveRails", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasActiveGridVirtualAccountForBusinessInDb.mockResolvedValue(false)
    getWalletOwnerId.mockResolvedValue("owner-1")
    resolveBusinessOrgOwnerUserId.mockResolvedValue("user-1")
    refreshGridBusinessReceiveRails.mockResolvedValue({
      gridVirtualAccountsPersisted: 1,
      gridVirtualAccountsPending: false,
      gridExternalAccountId: "ExternalAccount:1",
    })
  })

  it("refreshes approved Grid businesses missing USD VA", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "businesses") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  not: () => ({
                    order: () => ({
                      limit: async () => ({
                        data: [
                          {
                            id: "biz-1",
                            name: "VeraMind Inc",
                            grid_customer_id: "Customer:abc",
                            kyb_verified_at: "2026-08-27T22:00:00Z",
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === "wallet_owners") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { turnkey_sub_organization_id: "sub-1" },
                  error: null,
                }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
    } as never

    const result = await reconcilePendingGridBusinessReceiveRails(admin, { limit: 10 })

    expect(result.scanned).toBe(1)
    expect(result.refreshed).toBe(1)
    expect(refreshGridBusinessReceiveRails).toHaveBeenCalledWith({
      admin,
      businessId: "biz-1",
      userId: "user-1",
      gridCustomerId: "Customer:abc",
    })
    expect(result.rows[0]).toMatchObject({
      businessId: "biz-1",
      reason: "missing_usd_va",
      error: null,
    })
  })

  it("skips businesses that already have a USD VA and Turnkey sub-org", async () => {
    hasActiveGridVirtualAccountForBusinessInDb.mockResolvedValue(true)
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "businesses") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  not: () => ({
                    order: () => ({
                      limit: async () => ({
                        data: [
                          {
                            id: "biz-ready",
                            name: "Homeon",
                            grid_customer_id: "Customer:ready",
                            kyb_verified_at: "2026-08-26T12:00:00Z",
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === "wallet_owners") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { turnkey_sub_organization_id: "sub-ready" },
                  error: null,
                }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
    } as never

    const result = await reconcilePendingGridBusinessReceiveRails(admin, { limit: 10 })
    expect(result.scanned).toBe(0)
    expect(refreshGridBusinessReceiveRails).not.toHaveBeenCalled()
  })
})

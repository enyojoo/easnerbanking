import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  needsBusinessProvisionAfterApproval,
  needsBusinessTurnkeyVaultProvision,
  needsGridBusinessUsdVirtualAccountProvision,
  resolveGridBusinessProvisionNeeds,
} from "./needs-business-provision"

vi.mock("@/lib/wallet/resolve-wallet-owner", () => ({
  getWalletOwnerId: vi.fn(),
}))

vi.mock("@/lib/noah/virtual-accounts-db", () => ({
  hasActiveGridVirtualAccountForBusinessInDb: vi.fn(),
}))

import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"
import { hasActiveGridVirtualAccountForBusinessInDb } from "@/lib/noah/virtual-accounts-db"

const ownerIdMock = vi.mocked(getWalletOwnerId)
const hasGridVaMock = vi.mocked(hasActiveGridVirtualAccountForBusinessInDb)

function adminWithWalletAccounts(rows: Array<{ address?: string; ata?: string }>): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: async () => ({
              data:
                table === "wallet_accounts"
                  ? rows.map((row) => ({
                      id: "wa1",
                      address: row.address ?? "",
                      associated_token_account_address: row.ata ?? "",
                    }))
                  : [],
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe("needsBusinessTurnkeyVaultProvision", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns true when wallet owner is missing", async () => {
    ownerIdMock.mockResolvedValue(null)
    const admin = adminWithWalletAccounts([])
    await expect(
      needsBusinessTurnkeyVaultProvision(admin, { businessId: "biz-1" }),
    ).resolves.toBe(true)
  })

  it("returns false when an active vault address exists", async () => {
    ownerIdMock.mockResolvedValue("owner-1")
    const admin = adminWithWalletAccounts([{ address: "solana-address" }])
    await expect(
      needsBusinessTurnkeyVaultProvision(admin, { businessId: "biz-1" }),
    ).resolves.toBe(false)
  })
})

describe("needsGridBusinessUsdVirtualAccountProvision", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns true when Grid USD VA is missing", async () => {
    hasGridVaMock.mockResolvedValue(false)
    const admin = {} as SupabaseClient
    await expect(
      needsGridBusinessUsdVirtualAccountProvision(admin, {
        businessId: "biz-1",
      }),
    ).resolves.toBe(true)
    expect(hasGridVaMock).toHaveBeenCalledWith(admin, {
      currency: "usd",
      businessId: "biz-1",
    })
  })

  it("returns false when Grid USD VA exists", async () => {
    hasGridVaMock.mockResolvedValue(true)
    const admin = {} as SupabaseClient
    await expect(
      needsGridBusinessUsdVirtualAccountProvision(admin, {
        businessId: "biz-1",
      }),
    ).resolves.toBe(false)
  })
})

describe("resolveGridBusinessProvisionNeeds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reports both needs when vault and USD VA are missing", async () => {
    ownerIdMock.mockResolvedValue("owner-1")
    hasGridVaMock.mockResolvedValue(false)
    const admin = adminWithWalletAccounts([])
    await expect(
      resolveGridBusinessProvisionNeeds(admin, { businessId: "biz-1", userId: "user-1" }),
    ).resolves.toEqual({
      needsTurnkeyVaults: true,
      needsUsdVirtualAccount: true,
    })
  })

  it("reports ready when vault and USD VA exist", async () => {
    ownerIdMock.mockResolvedValue("owner-1")
    hasGridVaMock.mockResolvedValue(true)
    const admin = adminWithWalletAccounts([{ address: "vault" }])
    await expect(
      resolveGridBusinessProvisionNeeds(admin, { businessId: "biz-1", userId: "user-1" }),
    ).resolves.toEqual({
      needsTurnkeyVaults: false,
      needsUsdVirtualAccount: false,
    })
  })
})

describe("needsBusinessProvisionAfterApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns true when only USD VA is missing", async () => {
    ownerIdMock.mockResolvedValue("owner-1")
    hasGridVaMock.mockResolvedValue(false)
    const admin = adminWithWalletAccounts([{ address: "vault" }])
    await expect(
      needsBusinessProvisionAfterApproval(admin, { businessId: "biz-1", userId: "user-1" }),
    ).resolves.toBe(true)
  })
})

import { describe, expect, it, vi, beforeEach } from "vitest"
import { resolveConnectReadyForCheckout } from "./resolve-connect-account"

vi.mock("@/lib/compliance/business-tier1", () => ({
  businessUsesGridVerification: vi.fn(),
  isBusinessTier1Complete: vi.fn(),
}))

vi.mock("@/lib/noah/virtual-accounts-db", () => ({
  hasActiveGridVirtualAccountForBusinessInDb: vi.fn(),
  hasActiveVirtualAccountInDb: vi.fn(),
}))

import { businessUsesGridVerification, isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import {
  hasActiveGridVirtualAccountForBusinessInDb,
  hasActiveVirtualAccountInDb,
} from "@/lib/noah/virtual-accounts-db"

const tier1Mock = vi.mocked(isBusinessTier1Complete)
const usesGridMock = vi.mocked(businessUsesGridVerification)
const hasGridVaForBusinessMock = vi.mocked(hasActiveGridVirtualAccountForBusinessInDb)
const hasVaMock = vi.mocked(hasActiveVirtualAccountInDb)

function adminWith(biz: Record<string, unknown> | null, connectRow: Record<string, unknown> | null) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "businesses"
                ? biz
                : table === "business_stripe_connect_accounts"
                  ? connectRow
                  : null,
          }),
        }),
      }),
    }),
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  tier1Mock.mockReturnValue(true)
  usesGridMock.mockReturnValue(true)
  hasGridVaForBusinessMock.mockResolvedValue(true)
})

describe("resolveConnectReadyForCheckout", () => {
  it("detects Grid VA from business_id without org owner resolution", async () => {
    const admin = adminWith(
      { verification_status: "approved", verification_provider: "grid" },
      null,
    )

    const result = await resolveConnectReadyForCheckout(admin, "biz-1")

    expect(hasGridVaForBusinessMock).toHaveBeenCalledWith(admin, {
      currency: "usd",
      businessId: "biz-1",
    })
    expect(result.hasGridVa).toBe(true)
    expect(result.reason).toBe("Complete online payment setup")
  })

  it("reports missing VA when no active Grid business row exists", async () => {
    hasGridVaForBusinessMock.mockResolvedValue(false)
    const admin = adminWith(
      { verification_status: "approved", verification_provider: "grid" },
      { stripe_account_id: "acct_1", details_submitted: true },
    )

    const result = await resolveConnectReadyForCheckout(admin, "biz-1")

    expect(result.hasGridVa).toBe(false)
    expect(result.reason).toBe("Your Easner USD account is needed before payouts can be linked")
  })

  it("uses generic VA lookup for non-Grid businesses", async () => {
    usesGridMock.mockReturnValue(false)
    hasVaMock.mockResolvedValue(true)
    const admin = adminWith(
      { verification_status: "approved", verification_provider: "noah" },
      null,
    )

    const result = await resolveConnectReadyForCheckout(admin, "biz-1")

    expect(hasVaMock).toHaveBeenCalledWith(admin, {
      currency: "usd",
      businessId: "biz-1",
      provider: undefined,
    })
    expect(result.hasGridVa).toBe(true)
  })
})

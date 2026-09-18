import { describe, expect, it, vi, beforeEach } from "vitest"
import { resolveConnectReadyForCheckout } from "./resolve-connect-account"

vi.mock("@/lib/compliance/business-tier1", () => ({
  isBusinessTier1Complete: vi.fn(),
}))

vi.mock("./resolve-connect-payout-va", () => ({
  resolveConnectPayoutVa: vi.fn(),
}))

import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import { resolveConnectPayoutVa } from "./resolve-connect-payout-va"

const tier1Mock = vi.mocked(isBusinessTier1Complete)
const payoutVaMock = vi.mocked(resolveConnectPayoutVa)

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
  payoutVaMock.mockResolvedValue({
    va: { hasAccount: true, accountNumber: "1234567890" },
    provider: "grid",
    rail: "grid_va",
  } as never)
})

describe("resolveConnectReadyForCheckout", () => {
  it("uses the Office-preferred VA without a Grid-only lookup", async () => {
    const admin = adminWith(
      { verification_status: "approved", verification_provider: "grid" },
      null,
    )

    const result = await resolveConnectReadyForCheckout(admin, "biz-1")

    expect(payoutVaMock).toHaveBeenCalledWith(admin, { businessId: "biz-1", currency: "USD" })
    expect(result.hasGridVa).toBe(true)
    expect(result.reason).toBe("Complete online payment setup")
  })

  it("reports missing VA when the preferred provider has no account", async () => {
    payoutVaMock.mockResolvedValue(null)
    const admin = adminWith(
      { verification_status: "approved", verification_provider: "grid" },
      { stripe_account_id: "acct_1", details_submitted: true },
    )

    const result = await resolveConnectReadyForCheckout(admin, "biz-1")

    expect(result.hasGridVa).toBe(false)
    expect(result.reason).toBe("Your Easner USD account is needed before payouts can be linked")
  })

  it("accepts a Bridge VA when Office pay-in is Bridge", async () => {
    payoutVaMock.mockResolvedValue({
      va: { hasAccount: true, accountNumber: "5555666677" },
      provider: "bridge",
      rail: "bridge_va",
    } as never)
    const admin = adminWith(
      { verification_status: "in_progress", verification_provider: "grid" },
      null,
    )

    const result = await resolveConnectReadyForCheckout(admin, "biz-1")

    expect(result.hasGridVa).toBe(true)
    expect(result.reason).toBe("Complete online payment setup")
  })

  it("treats a Grid-linked payout as unlinked when Office prefers Bridge", async () => {
    payoutVaMock.mockResolvedValue({
      va: { hasAccount: true, accountNumber: "5555666677" },
      provider: "bridge",
      rail: "bridge_va",
    } as never)
    const admin = adminWith(
      { verification_status: "approved" },
      {
        stripe_account_id: "acct_1",
        details_submitted: true,
        transfers_enabled: true,
        payouts_enabled: true,
        stripe_external_account_id: "ba_grid",
        default_settlement_rail: "grid_va",
        requirements_currently_due: [],
      },
    )

    const result = await resolveConnectReadyForCheckout(admin, "biz-1")

    expect(result.externalAccountLinked).toBe(false)
    expect(result.ready).toBe(false)
    expect(result.reason).toBe("Link your virtual account as the payout destination")
  })
})

import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/app/api/noah/_helpers", () => ({
  requireAuth: vi.fn(),
  resolveNoahContextAsync: vi.fn(),
}))

vi.mock("@/lib/compliance/geo-personal-rail-access", () => ({
  requireGeoPersonalRailAccess: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { residence_country: "NG" } }),
        })),
      })),
    })),
  }),
}))

vi.mock("@/lib/yellowcard/quote-key", () => ({
  expireStaleYcPayInTransfers: vi.fn(() => Promise.resolve()),
}))

import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { requireGeoPersonalRailAccess } from "@/lib/compliance/geo-personal-rail-access"
import { resolveYcFundBalanceContext } from "@/lib/yellowcard/resolve-fund-balance-context"

describe("resolveYcFundBalanceContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses actor kycUserId on business scope", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "admin-1" },
    } as never)
    vi.mocked(resolveNoahContextAsync).mockResolvedValue({
      ok: true,
      scope: "business",
      businessId: "biz-1",
    } as never)
    vi.mocked(requireGeoPersonalRailAccess).mockResolvedValue({
      ok: true,
      actorUserId: "admin-1",
      businessId: "biz-1",
      role: "Admin",
      userRow: {
        id: "admin-1",
        residence_country: "NG",
        full_name: "Admin User",
      },
      residenceCountry: "NG",
    })

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ currency: "NGN", country: "NG", rail: "bank_transfer" }),
    })

    const result = await resolveYcFundBalanceContext(request)

    expect(result.error).toBeUndefined()
    expect(result.ctx?.kycUserId).toBe("admin-1")
    expect(result.ctx?.userRow?.residence_country).toBe("NG")
  })

  it("returns 403 when geo access is denied", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "viewer-1" },
    } as never)
    vi.mocked(resolveNoahContextAsync).mockResolvedValue({
      ok: true,
      scope: "business",
      businessId: "biz-1",
    } as never)
    vi.mocked(requireGeoPersonalRailAccess).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ code: "ROLE_DENIED" }, { status: 403 }),
    })

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ currency: "NGN", country: "NG" }),
    })

    const result = await resolveYcFundBalanceContext(request)

    expect(result.error).toBeDefined()
    expect(result.ctx).toBeUndefined()
  })
})

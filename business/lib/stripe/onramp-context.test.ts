import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/stripe/onramp-config", () => ({
  isStripeOnrampEnabled: () => true,
}))

vi.mock("@/app/api/noah/_helpers", () => ({
  requireAuth: vi.fn(),
  resolveNoahContextAsync: vi.fn(),
}))

vi.mock("@/lib/compliance/geo-personal-rail-access", () => ({
  requireGeoPersonalRailAccess: vi.fn(),
  actorExpressDepositsEligible: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: vi.fn() }),
}))

import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import {
  actorExpressDepositsEligible,
  requireGeoPersonalRailAccess,
} from "@/lib/compliance/geo-personal-rail-access"
import { resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"

describe("resolveExpressDepositsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses actor payer on business scope when US admin is eligible", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com" },
    } as never)
    vi.mocked(resolveNoahContextAsync).mockResolvedValue({
      ok: true,
      scope: "business",
      businessId: "biz-ng",
    } as never)
    vi.mocked(requireGeoPersonalRailAccess).mockResolvedValue({
      ok: true,
      actorUserId: "admin-1",
      businessId: "biz-ng",
      role: "Admin",
      userRow: { id: "admin-1", residence_country: "US", kyc_address_state: "CA" },
      residenceCountry: "US",
    })
    vi.mocked(actorExpressDepositsEligible).mockReturnValue(true)

    const result = await resolveExpressDepositsContext(new Request("http://localhost"))

    expect(result.error).toBeUndefined()
    expect(result.ctx?.payerUserId).toBe("admin-1")
    expect(result.ctx?.eligible).toBe(true)
  })

  it("returns role denial from geo helper for Member", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "member-1", email: "member@example.com" },
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

    const result = await resolveExpressDepositsContext(new Request("http://localhost"))

    expect(result.error).toBeDefined()
    expect(result.ctx).toBeUndefined()
  })
})

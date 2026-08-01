import { describe, expect, it, vi, beforeEach } from "vitest"

const mockPersistVerificationStatus = vi.fn().mockResolvedValue(undefined)
const mockParseGridCustomerForBusiness = vi.fn().mockReturnValue({
  name: "Acme Ltd",
  kyb_verified_at: "2025-01-01T00:00:00Z",
})
const mockNotifyBusinessKybStatusChange = vi.fn().mockResolvedValue(undefined)

vi.mock("@/lib/compliance", () => ({
  mapGridPartnerStatus: (raw: string) => {
    const s = String(raw ?? "").toUpperCase()
    if (s === "APPROVED") return "approved"
    if (s === "PENDING") return "pending"
    return "not_started"
  },
  persistVerificationStatus: (...args: unknown[]) => mockPersistVerificationStatus(...args),
}))

vi.mock("./parse-grid-customer-for-business", () => ({
  parseGridCustomerForBusiness: (...args: unknown[]) => mockParseGridCustomerForBusiness(...args),
}))

vi.mock("@/lib/notifications/verification-notify", () => ({
  notifyBusinessKybStatusChange: (...args: unknown[]) => mockNotifyBusinessKybStatusChange(...args),
}))

const mockBusinessUpdate = vi.fn()
const mockNot = vi.fn().mockResolvedValue({ error: null })
const mockEq = vi.fn().mockReturnValue({ not: mockNot })
mockBusinessUpdate.mockReturnValue({ eq: mockEq })

const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { verification_status: "not_started" },
      }),
    }),
  }),
  update: mockBusinessUpdate,
}))

const mockAdmin = { from: mockFrom }

import { syncGridBusinessKybToSupabase } from "./sync-kyb"

describe("syncGridBusinessKybToSupabase", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBusinessUpdate.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ not: mockNot })
  })

  it("clears stale kyb_verified_at when Grid KYB is not approved", async () => {
    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
      customer: { kybStatus: "PENDING" },
    })

    expect(mockPersistVerificationStatus).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({ status: "pending" }),
    )
    expect(mockBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ kyb_verified_at: null }),
    )
    expect(mockEq).toHaveBeenCalledWith("id", "biz-1")
    expect(mockNot).toHaveBeenCalledWith("kyb_verified_at", "is", null)
    expect(mockParseGridCustomerForBusiness).not.toHaveBeenCalled()
  })

  it("backfills business fields when Grid KYB is approved", async () => {
    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
      customer: { kybStatus: "APPROVED", businessInfo: { legalName: "Acme Ltd" } },
    })

    expect(mockParseGridCustomerForBusiness).toHaveBeenCalled()
    expect(mockBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Acme Ltd", kyb_verified_at: "2025-01-01T00:00:00Z" }),
    )
    expect(mockNot).not.toHaveBeenCalled()
  })

  it("sends KYB status emails on transitions", async () => {
    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
      customer: { kybStatus: "APPROVED" },
    })

    expect(mockNotifyBusinessKybStatusChange).toHaveBeenCalledWith(
      mockAdmin,
      "biz-1",
      "not_started",
      "approved",
      null,
    )
  })
})

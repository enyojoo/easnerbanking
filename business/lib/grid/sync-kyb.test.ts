import { describe, expect, it, vi, beforeEach } from "vitest"

const mockPersistVerificationStatus = vi.fn().mockResolvedValue(undefined)
const mockParseGridCustomerForBusiness = vi.fn().mockReturnValue({
  name: "Acme Ltd",
  kyb_verified_at: "2025-01-01T00:00:00Z",
})
const mockNotifyBusinessKybStatusChange = vi.fn().mockResolvedValue(undefined)
const mockGridFetch = vi.fn()

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

vi.mock("./http", () => ({
  gridFetch: (...args: unknown[]) => mockGridFetch(...args),
  GridHttpError: class GridHttpError extends Error {
    status: number
    constructor(status: number, message?: string) {
      super(message ?? `HTTP ${status}`)
      this.status = status
    }
  },
}))

const mockBusinessUpdate = vi.fn()
const mockEq = vi.fn().mockResolvedValue({ error: null })
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
    mockGridFetch.mockResolvedValue({ kybStatus: "PENDING" })
  })

  it("always fetches customer from Grid API (webhook + poll parity)", async () => {
    mockGridFetch.mockResolvedValue({ kybStatus: "PENDING" })

    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
      customer: { kybStatus: "APPROVED" },
    })

    expect(mockGridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/customers/Customer%3Aabc",
      }),
    )
    expect(mockPersistVerificationStatus).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({ status: "pending", verifiedAt: null }),
    )
    expect(mockParseGridCustomerForBusiness).not.toHaveBeenCalled()
    expect(mockBusinessUpdate).not.toHaveBeenCalled()
  })

  it("backfills business profile fields when Grid KYB is approved", async () => {
    mockGridFetch.mockResolvedValue({
      kybStatus: "APPROVED",
      businessInfo: { legalName: "Acme Ltd" },
    })

    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
      occurredAt: "2025-01-01T00:00:00Z",
    })

    expect(mockParseGridCustomerForBusiness).toHaveBeenCalled()
    expect(mockBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Acme Ltd", kyb_verified_at: "2025-01-01T00:00:00Z" }),
    )
    expect(mockEq).toHaveBeenCalledWith("id", "biz-1")
  })

  it("sends KYB status emails on transitions", async () => {
    mockGridFetch.mockResolvedValue({ kybStatus: "APPROVED" })

    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
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

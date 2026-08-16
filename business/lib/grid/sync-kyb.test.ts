import { describe, expect, it, vi, beforeEach } from "vitest"

const mockPersistVerificationStatus = vi.fn().mockResolvedValue(undefined)
const mockParseGridCustomerForBusiness = vi.fn().mockReturnValue({
  name: "Acme Ltd",
  kyb_verified_at: "2025-01-01T00:00:00Z",
})
const mockNotifyBusinessKybStatusChange = vi.fn().mockResolvedValue(undefined)
const mockGridFetch = vi.fn()

vi.mock("@/lib/compliance", () => ({
  persistVerificationStatus: (...args: unknown[]) => mockPersistVerificationStatus(...args),
}))

vi.mock("./parse-grid-customer-for-business", () => ({
  parseGridCustomerForBusiness: (...args: unknown[]) => mockParseGridCustomerForBusiness(...args),
}))

vi.mock("./sync-grid-business-owner-user", () => ({
  syncGridBusinessOwnerUserFromKyb: vi.fn().mockResolvedValue({
    ownerUserId: "user-1",
    beneficialOwnerId: null,
    ownerVerificationStatus: null,
  }),
}))

vi.mock("@/lib/notifications/verification-notify", () => ({
  notifyBusinessKybStatusChange: (...args: unknown[]) => mockNotifyBusinessKybStatusChange(...args),
}))

vi.mock("./kyb-application-store", () => ({
  persistKybApplicationFromGrid: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("./http", () => ({
  gridFetch: (...args: unknown[]) => mockGridFetch(...args),
  gridFetchAllPages: async () => [],
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

import { syncGridBusinessOwnerUserFromKyb } from "./sync-grid-business-owner-user"
import { syncGridBusinessKybToSupabase } from "./sync-kyb"

function mockGridReads(customer: Record<string, unknown>, verifications: unknown[] = []) {
  mockGridFetch.mockImplementation((req: { path?: string }) => {
    const path = String(req.path ?? "")
    if (path.includes("/verifications")) {
      return Promise.resolve({ data: verifications })
    }
    return Promise.resolve(customer)
  })
}

describe("syncGridBusinessKybToSupabase", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { verification_status: "not_started" },
          }),
        }),
      }),
      update: mockBusinessUpdate,
    })
    mockBusinessUpdate.mockReturnValue({ eq: mockEq })
    mockParseGridCustomerForBusiness.mockReturnValue({
      name: "Acme Ltd",
      kyb_verified_at: "2025-01-01T00:00:00Z",
    })
    mockGridReads({ kybStatus: "PENDING", beneficialOwners: [{ kycStatus: "PENDING" }] })
  })

  it("always fetches customer from Grid API (webhook + poll parity)", async () => {
    mockGridReads({ kybStatus: "UNVERIFIED" })
    mockParseGridCustomerForBusiness.mockReturnValue({})

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
      expect.objectContaining({ status: "not_started", verifiedAt: null }),
    )
    expect(mockParseGridCustomerForBusiness).not.toHaveBeenCalled()
    expect(mockBusinessUpdate).not.toHaveBeenCalled()
  })

  it("maps mid-flow PENDING + pending UBO to in_progress without profile backfill", async () => {
    mockGridReads(
      {
        kybStatus: "PENDING",
        email: "support@easner.com",
        businessInfo: { legalName: "Easner Group, Inc" },
        beneficialOwners: [{ kycStatus: "PENDING", roles: ["UBO"] }],
      },
      [],
    )

    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
    })

    expect(mockPersistVerificationStatus).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({ status: "in_progress" }),
    )
    expect(mockParseGridCustomerForBusiness).not.toHaveBeenCalled()
    expect(mockBusinessUpdate).not.toHaveBeenCalled()
    expect(mockNotifyBusinessKybStatusChange).toHaveBeenCalledWith(
      mockAdmin,
      "biz-1",
      "not_started",
      "not_started",
      null,
    )
  })

  it("backfills business profile fields when Grid KYB is truly pending (in review)", async () => {
    mockGridReads(
      {
        kybStatus: "PENDING",
        email: "support@easner.com",
        businessInfo: {
          legalName: "Easner Group, Inc",
          country: "US",
          registrationNumber: "10609372",
          taxId: "246398107",
        },
        beneficialOwners: [{ kycStatus: "APPROVED", roles: ["UBO"] }],
      },
      [{ verificationStatus: "PENDING_MANUAL_REVIEW" }],
    )
    mockParseGridCustomerForBusiness.mockReturnValue({
      name: "Easner Group, Inc",
    })

    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
    })

    expect(mockPersistVerificationStatus).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({ status: "pending" }),
    )
    expect(mockParseGridCustomerForBusiness).toHaveBeenCalled()
    expect(mockBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Easner Group, Inc" }),
    )
    expect(syncGridBusinessOwnerUserFromKyb).toHaveBeenCalled()
    expect(mockNotifyBusinessKybStatusChange).toHaveBeenCalledWith(
      mockAdmin,
      "biz-1",
      "not_started",
      "under_review",
      null,
    )
  })

  it("backfills business profile fields when Grid KYB is approved", async () => {
    mockGridReads({ kybStatus: "APPROVED", businessInfo: { legalName: "Acme Ltd" } })

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

  it("returns in-review to in_progress when Grid still requires the UBO ID", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { verification_status: "pending" },
          }),
        }),
      }),
      update: mockBusinessUpdate,
    })
    mockGridReads(
      {
        kybStatus: "PENDING",
        beneficialOwners: [{ kycStatus: "PENDING", roles: ["UBO"] }],
      },
      [{ verificationStatus: "RESOLVE_ERRORS", errors: [{ type: "MISSING_IDENTITY_DOCUMENT" }] }],
    )

    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
    })

    expect(mockPersistVerificationStatus).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({ status: "in_progress" }),
    )
    expect(mockNotifyBusinessKybStatusChange).toHaveBeenCalledWith(
      mockAdmin,
      "biz-1",
      "under_review",
      "not_started",
      null,
    )
  })

  it("does not drop hosted in-review when Grid documents are empty and ID is not missing", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { verification_status: "pending" },
          }),
        }),
      }),
      update: mockBusinessUpdate,
    })
    mockGridReads(
      {
        kybStatus: "PENDING",
        beneficialOwners: [{ kycStatus: "PENDING", roles: ["UBO"] }],
      },
      [],
    )

    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
    })

    expect(mockPersistVerificationStatus).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({ status: "pending" }),
    )
  })

  it("sends action-needed email when Grid KYB moves to hold", async () => {
    mockGridReads(
      {
        kybStatus: "HOLD",
        businessInfo: { legalName: "Acme Ltd" },
      },
      [],
    )

    await syncGridBusinessKybToSupabase({
      admin: mockAdmin as never,
      businessId: "biz-1",
      userId: "user-1",
      customerId: "Customer:abc",
    })

    expect(mockPersistVerificationStatus).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({ status: "hold" }),
    )
    expect(mockNotifyBusinessKybStatusChange).toHaveBeenCalledWith(
      mockAdmin,
      "biz-1",
      "not_started",
      "action_needed",
      expect.any(Array),
    )
  })

  it("sends KYB status emails on transitions", async () => {
    mockGridReads({ kybStatus: "APPROVED" })

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

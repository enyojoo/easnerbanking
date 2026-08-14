import { describe, expect, it, vi, beforeEach } from "vitest"
import { ebFromBusinessId, eiFromUserId } from "@easner/shared"

const mockGridFetch = vi.fn()

vi.mock("./http", () => ({
  gridFetch: (...args: unknown[]) => mockGridFetch(...args),
  GridHttpError: class GridHttpError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = "GridHttpError"
      this.status = status
    }
  },
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveOrgOwnerUserId: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111"),
}))

const BUSINESS_ID = "fd9c4c9a-a8c8-4019-9475-eb7317894f43"
const USER_ID = "11111111-1111-4111-8111-111111111111"
const CANONICAL_EB = ebFromBusinessId(BUSINESS_ID)
const CANONICAL_EI = eiFromUserId(USER_ID)
const STORED_CUSTOMER = "Customer:019fbdc4-7bc5-938e-0000-993715172f81"

const TERMS_CONSENT_ROW = {
  id: USER_ID,
  grid_end_user_terms_version: "2025-10-01",
  grid_end_user_terms_accepted_at: "2026-08-12T10:00:00.000Z",
  grid_end_user_terms_accept_ip: "203.0.113.10",
  grid_end_user_terms_accept_method: "signup_email",
}

function mockAdminForBusiness(storedGridId: string | null, opts?: { supportEmail?: string; ownerEmail?: string }) {
  const supportEmail = opts?.supportEmail ?? "owner@example.com"
  const ownerEmail = opts?.ownerEmail ?? "owner@example.com"
  const businessUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const userUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const businessRow = {
    grid_customer_id: storedGridId,
    name: "Test Biz",
    easetag: null,
    registration_number: null,
    tax_id: null,
    country: "US",
    address_line1: null,
    city: null,
    state: null,
    postal_code: null,
    support_email: supportEmail,
    created_at: "2024-01-01T00:00:00Z",
  }
  return {
    from: vi.fn((table: string) => {
      if (table === "businesses") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: storedGridId ? businessRow : { ...businessRow, grid_customer_id: undefined },
              }),
            }),
          }),
          update: businessUpdate,
        }
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: USER_ID, email: ownerEmail, full_name: "Jane Owner" }],
            }),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: storedGridId
                  ? { grid_customer_id: storedGridId, ...TERMS_CONSENT_ROW }
                  : { grid_customer_id: null, ...TERMS_CONSENT_ROW },
              }),
            }),
          }),
          update: userUpdate,
        }
      }
      throw new Error(`unexpected table ${table}`)
    }),
    businessUpdate,
    userUpdate,
  }
}

import { ensureGridBusinessCustomer } from "./ensure-grid-business-customer"
import { ensureGridCustomer } from "./ensure-grid-customer"

describe("ensureGridBusinessCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses stored grid_customer_id when GET succeeds (Enyo path)", async () => {
    // verify exists + full GET (consent already present → no PATCH)
    mockGridFetch
      .mockResolvedValueOnce({ id: STORED_CUSTOMER })
      .mockResolvedValueOnce({
        id: STORED_CUSTOMER,
        email: "owner@example.com",
        kybStatus: "APPROVED",
        endUserTermsConsent: { termsVersion: "2025-10-01" },
      })

    const admin = mockAdminForBusiness(STORED_CUSTOMER)
    const result = await ensureGridBusinessCustomer({
      admin: admin as never,
      userId: USER_ID,
      businessId: BUSINESS_ID,
    })

    expect(result.customerId).toBe(STORED_CUSTOMER)
    expect(result.platformCustomerId).toBe(CANONICAL_EB)
    expect(mockGridFetch).toHaveBeenCalledTimes(2)
    expect(mockGridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: `/customers/${encodeURIComponent(STORED_CUSTOMER)}`,
      }),
    )
  })

  it("patches Grid customer email to org owner when support email differs", async () => {
    mockGridFetch
      .mockResolvedValueOnce({ id: STORED_CUSTOMER })
      .mockResolvedValueOnce({
        id: STORED_CUSTOMER,
        email: "support@easner.com",
        kybStatus: "PENDING",
        endUserTermsConsent: { termsVersion: "2025-10-01" },
      })
      .mockResolvedValueOnce({
        id: STORED_CUSTOMER,
        email: "samuel@easner.com",
        kybStatus: "PENDING",
      })

    const admin = mockAdminForBusiness(STORED_CUSTOMER, {
      supportEmail: "support@easner.com",
      ownerEmail: "samuel@easner.com",
    })
    const result = await ensureGridBusinessCustomer({
      admin: admin as never,
      userId: USER_ID,
      businessId: BUSINESS_ID,
    })

    expect(result.customer.email).toBe("samuel@easner.com")
    expect(mockGridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        path: `/customers/${encodeURIComponent(STORED_CUSTOMER)}`,
        json: { email: "samuel@easner.com" },
      }),
    )
  })

  it("looks up by canonical eb_ platformCustomerId when stored id missing", async () => {
    mockGridFetch.mockResolvedValueOnce({
      data: [
        {
          id: STORED_CUSTOMER,
          email: "owner@example.com",
          platformCustomerId: CANONICAL_EB,
          endUserTermsConsent: { termsVersion: "2025-10-01" },
        },
      ],
    })

    const admin = mockAdminForBusiness(null)
    const result = await ensureGridBusinessCustomer({
      admin: admin as never,
      userId: USER_ID,
      businessId: BUSINESS_ID,
    })

    expect(result.customerId).toBe(STORED_CUSTOMER)
    expect(result.platformCustomerId).toBe(CANONICAL_EB)
    expect(mockGridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: expect.stringContaining("platformCustomerId="),
      }),
    )
  })
})

describe("ensureGridCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses stored grid_customer_id for individual scope", async () => {
    mockGridFetch
      .mockResolvedValueOnce({ id: STORED_CUSTOMER })
      .mockResolvedValueOnce({
        id: STORED_CUSTOMER,
        endUserTermsConsent: { termsVersion: "2025-10-01" },
      })

    const admin = mockAdminForBusiness(STORED_CUSTOMER)
    const result = await ensureGridCustomer({
      admin: admin as never,
      userId: USER_ID,
      scope: "individual",
      profile: {
        fullName: "Jane Doe",
        residenceCountry: "US",
        email: "jane@example.com",
      },
    })

    expect(result.customerId).toBe(STORED_CUSTOMER)
    expect(result.platformCustomerId).toBe(CANONICAL_EI)
  })
})

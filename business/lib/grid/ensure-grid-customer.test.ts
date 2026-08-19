import { describe, expect, it, vi, beforeEach } from "vitest"
import { ebFromBusinessId, eiFromUserId } from "@easner/shared"

const mockGridFetch = vi.fn()

vi.mock("./http", () => ({
  gridFetch: (...args: unknown[]) => mockGridFetch(...args),
  gridFetchAllPages: async (input: {
    path: string
    query?: Record<string, string | number | boolean | undefined>
    mapPage: (payload: { data?: unknown[]; cursor?: string | null }) => unknown[]
  }) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(input.query ?? {})) {
      if (v != null && String(v).trim()) params.set(k, String(v))
    }
    const qs = params.toString()
    const path = qs ? `${input.path}?${qs}` : input.path
    const page = (await mockGridFetch({ method: "GET", path })) as {
      data?: unknown[]
      cursor?: string | null
    }
    return input.mapPage(page ?? {})
  },
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

import {
  __resetEnsureGridBusinessCustomerInflightForTests,
  ensureGridBusinessCustomer,
} from "./ensure-grid-business-customer"
import { ensureGridCustomer } from "./ensure-grid-customer"

describe("ensureGridBusinessCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetEnsureGridBusinessCustomerInflightForTests()
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
        json: { customerType: "BUSINESS", email: "samuel@easner.com" },
      }),
    )
  })

  it("looks up by canonical eb_ platformCustomerId when stored id missing", async () => {
    const listed = {
      id: STORED_CUSTOMER,
      email: "owner@example.com",
      platformCustomerId: CANONICAL_EB,
      kybStatus: "UNVERIFIED",
      endUserTermsConsent: { termsVersion: "2025-10-01" },
    }
    mockGridFetch
      .mockResolvedValueOnce({ data: [listed] })
      .mockResolvedValueOnce(listed)

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

  it("shares one Grid create across concurrent callers for the same business", async () => {
    let postCount = 0
    const created = {
      id: STORED_CUSTOMER,
      email: "owner@example.com",
      kybStatus: "UNVERIFIED",
      endUserTermsConsent: { termsVersion: "2025-10-01" },
    }
    mockGridFetch.mockImplementation(async (opts: { method?: string; path?: string }) => {
      if (opts.method === "POST" && opts.path === "/customers") {
        postCount += 1
        await new Promise((resolve) => setTimeout(resolve, 40))
        return created
      }
      if (opts.method === "GET" && String(opts.path ?? "").includes(`/customers/${encodeURIComponent(STORED_CUSTOMER)}`)) {
        return created
      }
      return { data: [] }
    })

    const admin = mockAdminForBusiness(null)
    const [a, b] = await Promise.all([
      ensureGridBusinessCustomer({
        admin: admin as never,
        userId: USER_ID,
        businessId: BUSINESS_ID,
      }),
      ensureGridBusinessCustomer({
        admin: admin as never,
        userId: USER_ID,
        businessId: BUSINESS_ID,
      }),
    ])

    expect(postCount).toBe(1)
    expect(a.customerId).toBe(STORED_CUSTOMER)
    expect(b.customerId).toBe(STORED_CUSTOMER)
    expect(admin.businessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ grid_customer_id: STORED_CUSTOMER }),
    )
    expect(admin.businessUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ external_customer_id: expect.anything() }),
    )
    expect(mockGridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/customers",
        idempotencyKey: expect.stringMatching(/^grid-biz-create:/),
      }),
    )
  })
})

describe("ensureGridCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses stored grid_customer_id for individual scope", async () => {
    mockGridFetch.mockResolvedValueOnce({
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

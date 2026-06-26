import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("./map-kyc", () => ({
  mapNoahVerificationToKycStatus: vi.fn().mockReturnValue("approved"),
}))

vi.mock("./rejection-reasons", () => ({
  extractNoahRejectionReasons: vi.fn().mockReturnValue(null),
}))

vi.mock("./parse-noah-customer-for-business", () => ({
  parseNoahCustomerForBusiness: vi.fn().mockReturnValue({ name: "Acme Ltd", kyb_verified_at: "2025-01-01T00:00:00Z" }),
}))

vi.mock("./parse-noah-customer-for-users", () => ({
  parseNoahCustomerForUsers: vi.fn().mockReturnValue({
    full_name: "Jane Owner",
    kyc_verified_at: "2025-01-01T00:00:00Z",
    kyc_id_type: "Passport",
  }),
}))

const mockUsersUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const mockBusinessUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

const mockFrom = vi.fn((table: string) => {
  if (table === "users") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { noah_kyc_status: "not_started" } }),
        }),
      }),
      update: mockUsersUpdate,
    }
  }
  return { update: mockBusinessUpdate }
})

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveOrgOwnerUserId: vi.fn().mockResolvedValue("owner-user-id"),
}))

import { syncNoahCustomerToSupabase } from "./sync-user"
import { parseNoahCustomerForUsers } from "./parse-noah-customer-for-users"
import { parseNoahCustomerForBusiness } from "./parse-noah-customer-for-business"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"

describe("syncNoahCustomerToSupabase business branch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("syncs entity and owner person fields on business approval", async () => {
    await syncNoahCustomerToSupabase(
      { kind: "business", businessId: "biz-1" },
      {
        RegisteredName: "Acme Ltd",
        RegistrationNumber: "123",
        RegistrationCountry: "GB",
        RegisteredAddress: {
          Street: "1 Road",
          City: "London",
          State: "ENG",
          PostCode: "E1",
          Country: "GB",
        },
        FullName: { FirstName: "Jane", LastName: "Owner" },
        DateOfBirth: "1990-01-15",
        Identities: [{ IDType: "Passport", IDNumber: "P123", IssuingCountry: "GB" }],
        PrimaryResidence: {
          Street: "2 Home",
          City: "London",
          State: "ENG",
          PostCode: "E2",
          Country: "GB",
        },
        Verifications: { Status: "Approved" },
        Occurred: "2025-01-01T00:00:00Z",
      },
      "ebiz_biz1",
    )

    expect(mockFrom).toHaveBeenCalledWith("businesses")
    expect(mockFrom).toHaveBeenCalledWith("users")
    expect(parseNoahCustomerForBusiness).toHaveBeenCalled()
    expect(parseNoahCustomerForUsers).toHaveBeenCalled()
    expect(resolveOrgOwnerUserId).toHaveBeenCalled()
    expect(mockBusinessUpdate).toHaveBeenCalled()
    expect(mockUsersUpdate).toHaveBeenCalled()
  })
})

import { describe, expect, it, vi, beforeEach } from "vitest"

const {
  readVerificationRow,
  provisionGridAfterBusinessKybApproved,
  provisionNoahAfterVerificationApproved,
} = vi.hoisted(() => ({
  readVerificationRow: vi.fn(),
  provisionGridAfterBusinessKybApproved: vi.fn().mockResolvedValue({ grid: true }),
  provisionNoahAfterVerificationApproved: vi.fn().mockResolvedValue({ noah: true }),
}))

vi.mock("@/lib/compliance", () => ({
  readVerificationRow,
}))

vi.mock("@/lib/grid/provision-after-approval", () => ({
  provisionGridAfterBusinessKybApproved,
}))

vi.mock("@/lib/noah/provision-after-approval", () => ({
  provisionNoahAfterVerificationApproved,
}))

import { provisionAfterVerificationApproved } from "./provision-after-approval"

describe("provisionAfterVerificationApproved", () => {
  const admin = {} as import("@supabase/supabase-js").SupabaseClient

  beforeEach(() => {
    vi.clearAllMocks()
    readVerificationRow.mockResolvedValue({
      verification_provider: "grid",
      grid_customer_id: "Customer:test",
    })
  })

  it("routes approved business with Grid provider to Grid provisioner", async () => {
    const result = await provisionAfterVerificationApproved({
      admin,
      scope: "business",
      subjectUserId: "user-1",
      subjectBusinessId: "biz-1",
      partnerCustomerId: "Customer:test",
      provider: "grid",
    })

    expect(provisionGridAfterBusinessKybApproved).toHaveBeenCalledWith({
      admin,
      businessId: "biz-1",
      subjectUserId: "user-1",
      gridCustomerId: "Customer:test",
    })
    expect(provisionNoahAfterVerificationApproved).not.toHaveBeenCalled()
    expect(result).toEqual({ grid: true })
  })
})

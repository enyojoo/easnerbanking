import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { handleGridKybWebhook } from "./kyb-webhook"

const mockSync = vi.fn().mockResolvedValue({ status: "pending" })
const mockProvision = vi.fn().mockResolvedValue(undefined)

vi.mock("./sync-kyb", () => ({
  syncGridBusinessKybToSupabase: (...args: unknown[]) => mockSync(...args),
}))

vi.mock("@/lib/verification/provision-after-approval", () => ({
  provisionAfterVerificationApproved: (...args: unknown[]) => mockProvision(...args),
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveOrgOwnerUserId: vi.fn().mockResolvedValue("owner-user-1"),
}))

function makeAdmin(businessId: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: businessId ? { id: businessId } : null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as SupabaseClient
}

describe("handleGridKybWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reads customer id from data.id (Grid CUSTOMER.KYB_* shape)", async () => {
    const admin = makeAdmin("biz-1")
    const handled = await handleGridKybWebhook(admin, {
      type: "CUSTOMER.KYB_PENDING",
      timestamp: "2026-08-13T01:41:51.265850Z",
      data: {
        id: "Customer:019ff8a6-443d-938e-0000-f6f502845e5b",
        platformCustomerId: "eb_4769329da17149cf86477e9b8a0128d3",
        kybStatus: "PENDING",
      },
    })

    expect(handled).toEqual({ handled: true })
    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-1",
        userId: "owner-user-1",
        customerId: "Customer:019ff8a6-443d-938e-0000-f6f502845e5b",
        occurredAt: "2026-08-13T01:41:51.265850Z",
      }),
    )
    expect(mockProvision).not.toHaveBeenCalled()
  })

  it("resolves business by platformCustomerId when grid_customer_id lookup misses", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: { id: "biz-2" } })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const admin = { from } as unknown as SupabaseClient

    const handled = await handleGridKybWebhook(admin, {
      type: "CUSTOMER.KYB_PENDING",
      data: {
        id: "Customer:new",
        platformCustomerId: "eb_abc",
      },
    })

    expect(handled).toEqual({ handled: true })
    expect(mockSync).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz-2" }))
  })

  it("ignores non-KYB events", async () => {
    const admin = makeAdmin("biz-1")
    const handled = await handleGridKybWebhook(admin, {
      type: "INCOMING_PAYMENT.COMPLETED",
      data: { id: "Customer:abc" },
    })
    expect(handled).toEqual({ handled: false })
    expect(mockSync).not.toHaveBeenCalled()
  })
})

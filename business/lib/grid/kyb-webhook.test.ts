import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { handleGridKybWebhook, pickBusinessIdForKybOrgHints } from "./kyb-webhook"

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

  it("resolves _g2 platformCustomerId to the business uuid when external id misses", async () => {
    const businessId = "4769329d-a171-49cf-8647-7e9b8a0128d3"
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: { id: businessId } })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const admin = { from } as unknown as SupabaseClient

    const handled = await handleGridKybWebhook(admin, {
      type: "CUSTOMER.KYB_PENDING",
      data: {
        id: "Customer:new",
        platformCustomerId: `eb_${businessId.replace(/-/g, "")}_g2`,
      },
    })

    expect(handled).toEqual({ handled: true })
    expect(mockSync).toHaveBeenCalledWith(expect.objectContaining({ businessId }))
  })

  it("resolves business by registration number when platform eb_ is not canonical", async () => {
    const easnerId = "4769329d-a171-49cf-8647-7e9b8a0128d3"
    const select = vi.fn().mockReturnValue({
      eq: (column: string, value: string) => {
        const rows =
          column === "registration_number" && value === "10609372"
            ? [
                {
                  id: easnerId,
                  name: "Easner Group, Inc",
                  support_email: "support@easner.com",
                  registration_number: "10609372",
                },
              ]
            : null
        return {
          maybeSingle: async () => ({ data: null }),
          then(onFulfilled: (value: { data: unknown }) => unknown) {
            return Promise.resolve({ data: rows }).then(onFulfilled)
          },
        }
      },
    })
    const admin = { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient

    const handled = await handleGridKybWebhook(admin, {
      type: "CUSTOMER.KYB_PENDING",
      data: {
        id: "Customer:01a008db-9fbc-938e-0000-a3e2e6585384",
        email: "hello@easner.com",
        platformCustomerId: "eb_9283ea82870a492cb10d9505237c4894",
        businessInfo: {
          legalName: "Easner Group, Inc",
          registrationNumber: "10609372",
        },
      },
    })

    expect(handled).toEqual({ handled: true })
    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: easnerId,
        customerId: "Customer:01a008db-9fbc-938e-0000-a3e2e6585384",
      }),
    )
  })

  it("picks the org by registration number among webhook profile hints", () => {
    const id = pickBusinessIdForKybOrgHints(
      [
        {
          id: "4769329d-a171-49cf-8647-7e9b8a0128d3",
          name: "Easner Group, Inc",
          support_email: "support@easner.com",
          registration_number: "10609372",
        },
      ],
      {
        email: "hello@easner.com",
        legalName: "Easner Group, Inc",
        registrationNumber: "10609372",
      },
    )
    expect(id).toBe("4769329d-a171-49cf-8647-7e9b8a0128d3")
  })

  it("syncs VERIFICATION.RESOLVE_ERRORS using data.customerId", async () => {
    const admin = makeAdmin("biz-1")
    const handled = await handleGridKybWebhook(admin, {
      type: "VERIFICATION.RESOLVE_ERRORS",
      timestamp: "2026-08-16T05:42:47.165243Z",
      data: {
        id: "Verification:01a00918-1060-4d4a-0000-a20d667fa487",
        customerId: "Customer:01a008db-9fbc-938e-0000-a3e2e6585384",
        verificationStatus: "RESOLVE_ERRORS",
        errors: [{ type: "MISSING_IDENTITY_DOCUMENT" }],
      },
    })

    expect(handled).toEqual({ handled: true })
    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-1",
        customerId: "Customer:01a008db-9fbc-938e-0000-a3e2e6585384",
        occurredAt: "2026-08-16T05:42:47.165243Z",
      }),
    )
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

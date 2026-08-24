import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  kybOfficeBusinessUrl,
  kycOfficeUserUrl,
  resolveComplianceOpsEmail,
  resolveKybMerchantRecipients,
  resolveKybOpsEmail,
} from "./kyb-email-recipients"

describe("resolveKybMerchantRecipients", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns owner and admin with deduped emails", async () => {
    const admin = {
      from: (table: string) => {
        if (table === "business_memberships") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { user_id: "owner-1", role: "Owner", status: "active" },
                  { user_id: "admin-1", role: "Admin", status: "active" },
                  { user_id: "member-1", role: "Member", status: "active" },
                  { user_id: "invited-1", role: "Admin", status: "invited" },
                ],
              }),
            }),
          }
        }
        if (table === "users") {
          return {
            select: () => ({
              eq: (_col: string, userId: string) => ({
                maybeSingle: async () => {
                  if (userId === "owner-1") {
                    return { data: { email: "owner@example.com", full_name: "Owner One" }, error: null }
                  }
                  if (userId === "admin-1") {
                    return { data: { email: "admin@example.com", full_name: "Admin One" }, error: null }
                  }
                  return { data: null, error: null }
                },
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    }

    const recipients = await resolveKybMerchantRecipients(admin as never, "biz-1")
    expect(recipients).toHaveLength(2)
    expect(recipients.map((r) => r.email).sort()).toEqual(["admin@example.com", "owner@example.com"])
  })

  it("dedupes when owner and admin share an email", async () => {
    const admin = {
      from: (table: string) => {
        if (table === "business_memberships") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { user_id: "owner-1", role: "Owner", status: "active" },
                  { user_id: "admin-1", role: "Admin", status: "active" },
                ],
              }),
            }),
          }
        }
        if (table === "users") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { email: "same@example.com", full_name: "Same Person" },
                  error: null,
                }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    }

    const recipients = await resolveKybMerchantRecipients(admin as never, "biz-1")
    expect(recipients).toHaveLength(1)
    expect(recipients[0]?.email).toBe("same@example.com")
  })
})

describe("resolveComplianceOpsEmail", () => {
  it("defaults to compliance@easner.com", () => {
    const prevCompliance = process.env.EASNER_COMPLIANCE_OPS_EMAIL
    const prevKyb = process.env.EASNER_KYB_OPS_EMAIL
    delete process.env.EASNER_COMPLIANCE_OPS_EMAIL
    delete process.env.EASNER_KYB_OPS_EMAIL
    expect(resolveComplianceOpsEmail()).toBe("compliance@easner.com")
    expect(resolveKybOpsEmail()).toBe("compliance@easner.com")
    if (prevCompliance) process.env.EASNER_COMPLIANCE_OPS_EMAIL = prevCompliance
    if (prevKyb) process.env.EASNER_KYB_OPS_EMAIL = prevKyb
  })
})

describe("kybOfficeBusinessUrl", () => {
  it("links to office businesses highlight", () => {
    expect(kybOfficeBusinessUrl("biz-abc")).toBe(
      "https://bk.easner.com/businesses?highlight=biz-abc",
    )
  })
})

describe("kycOfficeUserUrl", () => {
  it("links to office users highlight", () => {
    expect(kycOfficeUserUrl("user-abc")).toBe("https://bk.easner.com/users?highlight=user-abc")
  })
})

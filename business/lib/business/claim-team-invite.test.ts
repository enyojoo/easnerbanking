import { describe, expect, it, vi } from "vitest"
import {
  claimTeamInvite,
  displayRoleFromMembership,
  findPendingTeamInvite,
  getInvitePreviewByMembershipId,
  normalizeInviteEmail,
} from "./claim-team-invite"

function mockAdmin(handlers: Record<string, (...args: unknown[]) => unknown>) {
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    const handler = handlers[table]
    if (!handler) {
      throw new Error(`No mock for table ${table}`)
    }
    return new Proxy(chain, {
      get(_target, prop) {
        if (prop === "then") return undefined
        return (...args: unknown[]) => {
          const result = handler(String(prop), ...args)
          if (result && typeof result === "object" && "then" in (result as object)) {
            return result
          }
          if (result !== undefined) return result
          return chain
        }
      },
    })
  })
  return { from } as unknown as Parameters<typeof claimTeamInvite>[0]
}

describe("normalizeInviteEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeInviteEmail("  User@Example.COM ")).toBe("user@example.com")
  })
})

describe("displayRoleFromMembership", () => {
  it("maps roles", () => {
    expect(displayRoleFromMembership("admin")).toBe("Admin")
    expect(displayRoleFromMembership("viewer")).toBe("Viewer")
    expect(displayRoleFromMembership("member")).toBe("Member")
  })
})

describe("findPendingTeamInvite", () => {
  it("returns invite when membership id matches", async () => {
    const admin = mockAdmin({
      business_memberships: (method: string) => {
        if (method === "select") {
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "mem-1",
                  business_id: "biz-1",
                  email: "invitee@example.com",
                  role: "member",
                  full_name: "Pat",
                  status: "invited",
                  user_id: null,
                },
                error: null,
              }),
            }),
          }
        }
      },
      businesses: (method: string) => {
        if (method === "select") {
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "biz-1" }, error: null }),
            }),
          }
        }
      },
    })

    const result = await findPendingTeamInvite(admin, {
      email: "invitee@example.com",
      membershipId: "mem-1",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.invite.business_id).toBe("biz-1")
    }
  })

  it("rejects email mismatch for membership id", async () => {
    const admin = mockAdmin({
      business_memberships: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "mem-1",
              business_id: "biz-1",
              email: "other@example.com",
              role: "member",
              status: "invited",
              user_id: null,
            },
            error: null,
          }),
        }),
      }),
    })

    const result = await findPendingTeamInvite(admin, {
      email: "invitee@example.com",
      membershipId: "mem-1",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("EMAIL_MISMATCH")
  })
})

describe("claimTeamInvite", () => {
  it("returns claimed false when membership id omitted", async () => {
    const admin = mockAdmin({})
    const result = await claimTeamInvite(admin, {
      userId: "user-1",
      authEmail: "a@example.com",
      fullName: "Alex",
    })
    expect(result).toEqual({ ok: true, claimed: false })
  })

  it("rejects when user already has a business", async () => {
    const admin = mockAdmin({
      users: (method: string) => {
        if (method === "select") {
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "user-1", easner_business_id: "existing-biz", role: "business" },
                error: null,
              }),
            }),
          }
        }
      },
    })

    const result = await claimTeamInvite(admin, {
      userId: "user-1",
      authEmail: "a@example.com",
      fullName: "Alex",
      membershipId: "mem-1",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("ALREADY_HAS_BUSINESS")
  })
})

describe("getInvitePreviewByMembershipId", () => {
  it("returns invite email and full name for pending membership", async () => {
    const admin = mockAdmin({
      business_memberships: (method: string) => {
        if (method === "select") {
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "mem-1",
                  role: "admin",
                  status: "invited",
                  business_id: "biz-1",
                  email: " Invitee@Example.com ",
                  full_name: "Alex Invite",
                },
                error: null,
              }),
            }),
          }
        }
      },
      businesses: (method: string) => {
        if (method === "select") {
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: { name: "Acme Ltd" },
                error: null,
              }),
            }),
          }
        }
      },
    })

    const result = await getInvitePreviewByMembershipId(admin, "mem-1")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.email).toBe("invitee@example.com")
      expect(result.fullName).toBe("Alex Invite")
      expect(result.businessName).toBe("Acme Ltd")
      expect(result.role).toBe("Admin")
    }
  })
})

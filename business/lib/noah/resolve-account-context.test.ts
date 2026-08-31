import { describe, expect, it, vi, beforeEach } from "vitest"

const mockReadNoahScope = vi.fn()
const mockGetBusinessRoleForUser = vi.fn()
const mockResolveOrgOwnerUserId = vi.fn()

vi.mock("./resolve-noah-context", () => ({
  readNoahScopeFromRequest: (...args: unknown[]) => mockReadNoahScope(...args),
}))

vi.mock("@/lib/b2b/require-role", () => ({
  getBusinessRoleForUser: (...args: unknown[]) => mockGetBusinessRoleForUser(...args),
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveOrgOwnerUserId: (...args: unknown[]) => mockResolveOrgOwnerUserId(...args),
}))

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
  return { from }
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}))

import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveNoahAccountContext } from "./resolve-account-context"

const ORG_ID = "biz-1"
const OWNER_ID = "owner-1"
const ADMIN_ID = "admin-1"
const VIEWER_ID = "viewer-1"

function businessRequest() {
  return new Request("https://business.easner.com/api/wallets/on-chain-balances", {
    headers: { "X-Easner-Account-Scope": "business" },
  })
}

function adminForBusinessUser(membership?: { role: string; status: string } | null) {
  return mockAdmin({
    users: (method: string) => {
      if (method === "select") {
        return {
          eq: () => ({
            maybeSingle: async () => ({
              data: { easner_business_id: ORG_ID },
              error: null,
            }),
          }),
        }
      }
      return {}
    },
    business_memberships: (method: string) => {
      if (method === "select") {
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: membership ?? { role: "admin", status: "active" },
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    },
  })
}

describe("resolveNoahAccountContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadNoahScope.mockReturnValue("business")
    mockResolveOrgOwnerUserId.mockResolvedValue(OWNER_ID)
  })

  it("allows admin read with org owner identity", async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(
      adminForBusinessUser() as ReturnType<typeof createSupabaseAdmin>,
    )
    mockGetBusinessRoleForUser.mockResolvedValue("Admin")

    const result = await resolveNoahAccountContext(businessRequest(), ADMIN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ctx.subjectBusinessId).toBe(ORG_ID)
    expect(result.ctx.subjectUserId).toBe(OWNER_ID)
    expect(result.ctx.noahCustomerId).toBe("ebiz_biz1")
  })

  it("allows viewer read", async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(
      adminForBusinessUser({ role: "viewer", status: "active" }) as ReturnType<typeof createSupabaseAdmin>,
    )
    mockGetBusinessRoleForUser.mockResolvedValue("Viewer")

    const result = await resolveNoahAccountContext(businessRequest(), VIEWER_ID)
    expect(result.ok).toBe(true)
  })

  it("denies viewer write with ROLE_DENIED", async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(
      adminForBusinessUser({ role: "viewer", status: "active" }) as ReturnType<typeof createSupabaseAdmin>,
    )
    mockGetBusinessRoleForUser.mockResolvedValue("Viewer")

    const result = await resolveNoahAccountContext(businessRequest(), VIEWER_ID, undefined, "write")

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(403)
    const body = await result.response.json()
    expect(body.code).toBe("ROLE_DENIED")
  })

  it("allows owner write", async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(
      adminForBusinessUser({ role: "owner", status: "active" }) as ReturnType<typeof createSupabaseAdmin>,
    )
    mockGetBusinessRoleForUser.mockResolvedValue("Owner")

    const result = await resolveNoahAccountContext(businessRequest(), OWNER_ID, undefined, "write")
    expect(result.ok).toBe(true)
  })

  it("denies invited membership", async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(
      adminForBusinessUser({ role: "admin", status: "invited" }) as ReturnType<typeof createSupabaseAdmin>,
    )

    const result = await resolveNoahAccountContext(businessRequest(), ADMIN_ID)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(403)
    const body = await result.response.json()
    expect(body.code).toBe("INVITE_PENDING")
  })
})

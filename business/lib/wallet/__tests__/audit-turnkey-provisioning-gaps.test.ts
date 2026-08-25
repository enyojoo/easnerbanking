import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/turnkey/ensure-parent-provisioning-policy", () => ({
  ensureParentSubOrgProvisioningPolicy: vi.fn().mockResolvedValue({
    ok: true,
    alreadyExists: true,
    pendingActivityId: null,
  }),
}))

import { auditTurnkeyProvisioningGaps } from "../audit-turnkey-provisioning-gaps"

function mockQuery(result: { data?: unknown; count?: number | null; error?: null }) {
  const promise = Promise.resolve(result)
  const chain = {
    select: vi.fn(function select() {
      return chain
    }),
    eq: vi.fn(function eq() {
      return chain
    }),
    limit: vi.fn(() => promise),
    maybeSingle: vi.fn(() => promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
  return chain
}

describe("auditTurnkeyProvisioningGaps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("flags approved business owners without Turnkey sub-orgs", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "wallet_provisioning_jobs") {
          return mockQuery({ count: 2 })
        }
        if (table === "businesses") {
          return mockQuery({
            data: [
              {
                id: "biz-1",
                name: "Grizzly Construction Inc",
                verification_status: "approved",
                verification_provider: "grid",
                grid_customer_id: "Customer:test",
              },
            ],
          })
        }
        if (table === "wallet_owners") {
          return mockQuery({
            data: { id: "owner-1", turnkey_sub_organization_id: null },
          })
        }
        if (table === "users") {
          return mockQuery({ data: [] })
        }
        throw new Error(`unexpected table ${table}`)
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient

    const report = await auditTurnkeyProvisioningGaps(admin)

    expect(report.summary.businessApprovedWithoutSubOrg).toBe(1)
    expect(report.approvedWithoutSubOrg[0]).toMatchObject({
      ownerType: "business",
      ownerRef: "biz-1",
      partnerCustomerId: "Customer:test",
    })
    expect(report.awaitingSubOrgJobCount).toBe(2)
  })
})

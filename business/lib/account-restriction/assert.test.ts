import { describe, expect, it } from "vitest"
import { assertAccountAllows } from "./assert"
import { isGridCustomerComplianceSuspended } from "./grid-compliance"
import { isNoahCustomerRestricted } from "./noah-compliance"
import type { SupabaseClient } from "@supabase/supabase-js"

function makeAssertAdmin(restriction: Record<string, unknown> | null) {
  const chain = {
    maybeSingle: async () => ({ data: restriction, error: null }),
  }
  const eqSecond = {
    eq: () => chain,
    maybeSingle: chain.maybeSingle,
  }
  const eqFirst = {
    eq: () => eqSecond,
    maybeSingle: chain.maybeSingle,
  }
  const from = () => ({
    select: () => ({
      is: () => ({
        limit: () => eqFirst,
      }),
    }),
  })
  return { from } as unknown as SupabaseClient
}

describe("account restriction enforcement", () => {
  it("blocks deposits during wind-down", async () => {
    const admin = makeAssertAdmin({
      subject_kind: "business",
      business_id: "biz-1",
      user_id: null,
      phase: "wind_down",
      source: "office",
      restricted_at: "2026-09-01T12:00:00.000Z",
      wind_down_ends_at: "2026-09-03T12:00:00.000Z",
      locked_at: null,
      lifted_at: null,
      reason: null,
    })
    const result = await assertAccountAllows(admin, { businessId: "biz-1", role: "business" }, "deposit")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("ACCOUNT_RESTRICTED")
  })

  it("blocks send during wind-down", async () => {
    const admin = makeAssertAdmin({
      subject_kind: "business",
      business_id: "biz-1",
      user_id: null,
      phase: "wind_down",
      source: "office",
      restricted_at: "2026-09-01T12:00:00.000Z",
      wind_down_ends_at: "2026-09-03T12:00:00.000Z",
      locked_at: null,
      lifted_at: null,
      reason: null,
    })
    const result = await assertAccountAllows(admin, { businessId: "biz-1", role: "business" }, "send")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("ACCOUNT_RESTRICTED")
  })

  it("detects grid compliance suspended without touching kyb", () => {
    expect(
      isGridCustomerComplianceSuspended({
        kybStatus: "APPROVED",
        complianceStatus: "COMPLIANCE_SUSPENDED",
      }),
    ).toBe(true)
    expect(isGridCustomerComplianceSuspended({ kybStatus: "APPROVED" })).toBe(false)
  })

  it("detects noah restricted customer", () => {
    expect(isNoahCustomerRestricted({ Status: "Suspended" })).toBe(true)
    expect(isNoahCustomerRestricted({ Status: "Approved" })).toBe(false)
  })
})

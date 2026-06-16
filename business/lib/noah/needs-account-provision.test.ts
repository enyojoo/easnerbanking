import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isNoahFiatRailProvisionSatisfied,
  needsNoahFiatVirtualAccountProvision,
} from "./needs-account-provision"

vi.mock("./noah-tier-guards", () => ({
  isNoahVerificationApproved: vi.fn(),
}))

vi.mock("./list-payment-methods", () => ({
  fetchAllPaymentMethodsForCustomer: vi.fn(),
}))

vi.mock("./virtual-accounts-db", () => ({
  getVirtualAccountDisplayFromDb: vi.fn(),
}))

vi.mock("./payment-method-map", () => ({
  selectPreferredUsdPayinPaymentMethod: vi.fn(),
  selectPreferredEurPayinPaymentMethod: vi.fn(),
}))

import { isNoahVerificationApproved } from "./noah-tier-guards"
import { fetchAllPaymentMethodsForCustomer } from "./list-payment-methods"
import { getVirtualAccountDisplayFromDb } from "./virtual-accounts-db"
import {
  selectPreferredEurPayinPaymentMethod,
  selectPreferredUsdPayinPaymentMethod,
} from "./payment-method-map"

const approvedMock = vi.mocked(isNoahVerificationApproved)
const fetchPmsMock = vi.mocked(fetchAllPaymentMethodsForCustomer)
const dbVaMock = vi.mocked(getVirtualAccountDisplayFromDb)
const usdPmMock = vi.mocked(selectPreferredUsdPayinPaymentMethod)
const eurPmMock = vi.mocked(selectPreferredEurPayinPaymentMethod)

function adminWithMirroredIds(usd: string | null, eur: string | null): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === "users") {
              return {
                data: {
                  noah_customer_id: "eind_abc",
                  noah_usd_virtual_account_id: usd,
                  noah_eur_virtual_account_id: eur,
                },
              }
            }
            return { data: null }
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe("isNoahFiatRailProvisionSatisfied", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbVaMock.mockResolvedValue(null)
    usdPmMock.mockReturnValue(undefined)
    eurPmMock.mockReturnValue(undefined)
  })

  it("is satisfied when mirrored id exists", async () => {
    const admin = adminWithMirroredIds("pm_usd", null)
    const ok = await isNoahFiatRailProvisionSatisfied(admin, {
      scope: "individual",
      subjectUserId: "user-1",
      subjectBusinessId: null,
      rail: "usd",
      paymentMethods: [],
    })
    expect(ok).toBe(true)
  })

  it("is satisfied when Noah has no payin PM for the rail", async () => {
    const admin = adminWithMirroredIds(null, null)
    usdPmMock.mockReturnValue(undefined)
    const ok = await isNoahFiatRailProvisionSatisfied(admin, {
      scope: "individual",
      subjectUserId: "user-1",
      subjectBusinessId: null,
      rail: "usd",
      paymentMethods: [],
    })
    expect(ok).toBe(true)
  })

  it("is not satisfied when PM exists but not mirrored or cached", async () => {
    const admin = adminWithMirroredIds(null, null)
    usdPmMock.mockReturnValue({ ID: "pm_1" })
    const ok = await isNoahFiatRailProvisionSatisfied(admin, {
      scope: "individual",
      subjectUserId: "user-1",
      subjectBusinessId: null,
      rail: "usd",
      paymentMethods: [{ ID: "pm_1" }],
    })
    expect(ok).toBe(false)
  })
})

describe("needsNoahFiatVirtualAccountProvision", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    approvedMock.mockResolvedValue(true)
    fetchPmsMock.mockResolvedValue([])
    dbVaMock.mockResolvedValue(null)
    usdPmMock.mockReturnValue(undefined)
    eurPmMock.mockReturnValue(undefined)
  })

  it("returns false when both rails are unavailable (no payin PMs)", async () => {
    const admin = adminWithMirroredIds(null, null)
    const needs = await needsNoahFiatVirtualAccountProvision(admin, {
      scope: "individual",
      subjectUserId: "user-1",
      subjectBusinessId: null,
    })
    expect(needs).toBe(false)
  })

  it("returns true when USD PM exists but is not mirrored", async () => {
    const admin = adminWithMirroredIds(null, null)
    usdPmMock.mockReturnValue({ ID: "pm_usd" })
    fetchPmsMock.mockResolvedValue([{ ID: "pm_usd" }])
    const needs = await needsNoahFiatVirtualAccountProvision(admin, {
      scope: "individual",
      subjectUserId: "user-1",
      subjectBusinessId: null,
    })
    expect(needs).toBe(true)
  })

  it("returns false when verification is not approved", async () => {
    approvedMock.mockResolvedValue(false)
    const admin = adminWithMirroredIds(null, null)
    const needs = await needsNoahFiatVirtualAccountProvision(admin, {
      scope: "individual",
      subjectUserId: "user-1",
      subjectBusinessId: null,
    })
    expect(needs).toBe(false)
  })
})

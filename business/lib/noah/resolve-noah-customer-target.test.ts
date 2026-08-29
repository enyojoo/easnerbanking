import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX,
  noahCustomerIdForIndividualRecreate,
  noahCustomerIdFromBusinessId,
  parseEasnerNoahCustomerId,
} from "./customer-id"
import { resolveNoahCustomerTarget } from "./resolve-noah-customer-target"

const USER_ID = "10819b49-d21b-416b-b1bc-39240abc5d86"

function adminForUsers(byNoahCustomerId: Record<string, string>): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === "users" && col === "noah_customer_id" && byNoahCustomerId[val]) {
              return { data: { id: byNoahCustomerId[val] } }
            }
            return { data: null }
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe("parseEasnerNoahCustomerId", () => {
  it("parses business ebiz_ ids", () => {
    const businessId = "4769329d-a171-49cf-8647-7e9b8a0128d3"
    const customerId = noahCustomerIdFromBusinessId(businessId)
    expect(customerId.startsWith(EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX)).toBe(true)
    const parsed = parseEasnerNoahCustomerId(customerId)
    expect(parsed).toEqual({ kind: "business", businessId })
  })
})

describe("resolveNoahCustomerTarget", () => {
  it("maps a reminted eind_ id via stored noah_customer_id, not the hex uuid", async () => {
    const remintId = noahCustomerIdForIndividualRecreate(USER_ID, 1)
    const admin = adminForUsers({ [remintId]: USER_ID })
    const parsed = await resolveNoahCustomerTarget(admin, { customerId: remintId })
    expect(parsed).toEqual({ kind: "individual", userId: USER_ID })
    const decoded = parseEasnerNoahCustomerId(remintId)
    expect(decoded?.kind).toBe("individual")
    expect(decoded && decoded.kind === "individual" ? decoded.userId : null).not.toBe(USER_ID)
  })
})

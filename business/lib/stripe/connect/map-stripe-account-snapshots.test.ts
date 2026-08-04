import { describe, expect, it } from "vitest"
import {
  mapBusinessProfileSnapshot,
  mapCapabilitiesSnapshot,
  mapRequirementsSnapshot,
} from "./map-stripe-account-snapshots"

describe("mapRequirementsSnapshot", () => {
  it("captures full requirements state", () => {
    const snapshot = mapRequirementsSnapshot({
      currently_due: ["business_profile.url"],
      eventually_due: ["person.verification.document"],
      past_due: [],
      pending_verification: ["company.tax_id"],
      disabled_reason: null,
      current_deadline: 1_700_000_000,
      errors: [{ code: "invalid_value", reason: "Invalid URL", requirement: "business_profile.url" }],
    } as never)
    expect(snapshot.currently_due).toEqual(["business_profile.url"])
    expect(snapshot.eventually_due).toEqual(["person.verification.document"])
    expect(snapshot.pending_verification).toEqual(["company.tax_id"])
    expect(snapshot.errors[0]?.requirement).toBe("business_profile.url")
  })
})

describe("mapCapabilitiesSnapshot", () => {
  it("stringifies all capability statuses", () => {
    expect(
      mapCapabilitiesSnapshot({
        transfers: "active",
        card_payments: "pending",
      } as never),
    ).toEqual({
      transfers: "active",
      card_payments: "pending",
    })
  })
})

describe("mapBusinessProfileSnapshot", () => {
  it("prefers business_profile over company fallbacks", () => {
    expect(
      mapBusinessProfileSnapshot({
        country: "US",
        business_profile: {
          name: "Acme LLC",
          url: "https://acme.example",
          support_email: "billing@acme.example",
        },
        company: { name: "Acme Company" },
      } as never),
    ).toEqual({
      name: "Acme LLC",
      url: "https://acme.example",
      support_email: "billing@acme.example",
      support_phone: null,
      mcc: null,
      country: "US",
    })
  })
})

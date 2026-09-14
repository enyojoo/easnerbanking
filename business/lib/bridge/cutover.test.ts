import { describe, expect, it } from "vitest"
import { shouldHideNoahConsumerVirtualAccounts } from "./cutover"

describe("shouldHideNoahConsumerVirtualAccounts", () => {
  it("hides Noah after Bridge approval", () => {
    expect(
      shouldHideNoahConsumerVirtualAccounts({
        verification_provider: "bridge",
        verification_status: "approved",
        bridge_kyc_status: "approved",
        kyc_address_country: "US",
        kyc_address_state: "CA",
      }),
    ).toBe(true)
  })

  it("hides Noah after the wind-down deadline", () => {
    expect(
      shouldHideNoahConsumerVirtualAccounts({
        verification_provider: "noah",
        bridge_cutover_deadline_at: new Date(Date.now() - 60_000).toISOString(),
        kyc_address_country: "GB",
      }),
    ).toBe(true)
  })

  it("keeps Noah for New York", () => {
    expect(
      shouldHideNoahConsumerVirtualAccounts({
        verification_provider: "noah",
        verification_status: "approved",
        bridge_cutover_deadline_at: new Date(Date.now() - 60_000).toISOString(),
        kyc_address_country: "US",
        kyc_address_state: "NY",
      }),
    ).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { buildRelayDepositAddressesPayload } from "./list-addresses"

describe("buildRelayDepositAddressesPayload", () => {
  it("hides Relay when the feature is off", () => {
    expect(buildRelayDepositAddressesPayload({ enabled: false })).toEqual({
      enabled: false,
      status: "unavailable",
      addresses: [],
    })
  })

  it("returns the active Tron USDT address", () => {
    expect(
      buildRelayDepositAddressesPayload({
        enabled: true,
        tronAddress: "Taddr",
        addressStatus: "active",
        estimatedFeeBps: 12,
      }),
    ).toEqual({
      enabled: true,
      status: "active",
      addresses: [
        { asset: "USDT", network: "Tron", address: "Taddr", estimatedFeeBps: 12 },
      ],
    })
  })

  it("stays provisioning so Receive still lists USDT before the address exists", () => {
    expect(buildRelayDepositAddressesPayload({ enabled: true })).toEqual({
      enabled: true,
      status: "provisioning",
      addresses: [],
    })
  })
})

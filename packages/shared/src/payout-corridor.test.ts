import { describe, expect, it } from "vitest"
import {
  isBalancePayoutCorridorExecutable,
  isNoahBalancePayoutCorridor,
  resolvePrimaryPayoutProvider,
} from "./payout-corridor"

describe("isBalancePayoutCorridorExecutable", () => {
  it("requires Noah sell when Noah is primary", () => {
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "noah", priority: 1 }],
        noah_sell_available: true,
      }),
    ).toBe(true)
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "noah", priority: 1 }],
        noah_sell_available: false,
      }),
    ).toBe(false)
  })

  it("ignores missing Noah sell when Grid is primary", () => {
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "grid", priority: 1 }],
        noah_sell_available: false,
        grid_send_available: true,
      }),
    ).toBe(true)
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "grid", priority: 1 }],
        noah_sell_available: false,
        grid_send_available: false,
      }),
    ).toBe(false)
  })

  it("respects provider_health for Grid", () => {
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "grid", priority: 1 }],
        provider_health: { grid: "unavailable" },
      }),
    ).toBe(false)
  })

  it("resolves primary from routing priority", () => {
    expect(
      resolvePrimaryPayoutProvider([
        { provider: "noah", priority: 2 },
        { provider: "grid", priority: 1 },
      ]),
    ).toBe("grid")
  })
})

describe("isNoahBalancePayoutCorridor", () => {
  it("is true only when Noah is primary", () => {
    expect(
      isNoahBalancePayoutCorridor({
        provider_routing: [{ provider: "noah", priority: 1 }],
      }),
    ).toBe(true)
    expect(
      isNoahBalancePayoutCorridor({
        provider_routing: [{ provider: "grid", priority: 1 }],
      }),
    ).toBe(false)
  })
})

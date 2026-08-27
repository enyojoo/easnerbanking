import { describe, expect, it } from "vitest"
import {
  isBalancePayoutCorridorExecutable,
  isCustomerFacingFiatCorridorLive,
  isNoahBalancePayoutCorridor,
  pickPublicPayInMetadata,
  resolvePrimaryPayoutProvider,
} from "./payout-corridor"

describe("isBalancePayoutCorridorExecutable", () => {
  it("requires Noah sell when Noah is primary and enabled", () => {
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "noah", priority: 1 }],
        metadata: { noah_send_enabled: true },
        noah_sell_available: true,
      }),
    ).toBe(true)
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "noah", priority: 1 }],
        metadata: { noah_send_enabled: true },
        noah_sell_available: false,
      }),
    ).toBe(false)
  })

  it("returns false when routing is empty or payout is not Office-enabled", () => {
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [],
        metadata: { noah_send_enabled: true },
        noah_sell_available: true,
      }),
    ).toBe(false)
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "grid", priority: 1 }],
        metadata: { grid_send_enabled: false },
        grid_send_available: true,
      }),
    ).toBe(false)
  })

  it("ignores missing Noah sell when Grid is primary and enabled", () => {
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "grid", priority: 1 }],
        metadata: { grid_send_enabled: true },
        noah_sell_available: false,
        grid_send_available: true,
      }),
    ).toBe(true)
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "grid", priority: 1 }],
        metadata: { grid_send_enabled: true },
        noah_sell_available: false,
        grid_send_available: false,
      }),
    ).toBe(false)
  })

  it("respects provider_health for Grid", () => {
    expect(
      isBalancePayoutCorridorExecutable({
        provider_routing: [{ provider: "grid", priority: 1 }],
        metadata: { grid_send_enabled: true },
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
  it("is true only when Noah is primary and enabled", () => {
    expect(
      isNoahBalancePayoutCorridor({
        provider_routing: [{ provider: "noah", priority: 1 }],
        metadata: { noah_send_enabled: true },
      }),
    ).toBe(true)
    expect(
      isNoahBalancePayoutCorridor({
        provider_routing: [{ provider: "grid", priority: 1 }],
        metadata: { grid_send_enabled: true },
      }),
    ).toBe(false)
    expect(isNoahBalancePayoutCorridor({ provider_routing: [] })).toBe(false)
  })
})

describe("isCustomerFacingFiatCorridorLive", () => {
  it("requires enabled plus payout or pay-in provider on the rail", () => {
    expect(
      isCustomerFacingFiatCorridorLive({
        enabled: true,
        provider_routing: [{ provider: "grid", priority: 1 }],
        metadata: { grid_send_enabled: true },
      }),
    ).toBe(true)
    expect(
      isCustomerFacingFiatCorridorLive({
        enabled: true,
        provider_routing: [],
        metadata: { grid_receive_enabled: true },
      }),
    ).toBe(true)
    expect(
      isCustomerFacingFiatCorridorLive({
        enabled: true,
        provider_routing: [],
        metadata: { pay_in_mode: "va_express" },
      }),
    ).toBe(true)
    expect(
      isCustomerFacingFiatCorridorLive({
        enabled: true,
        provider_routing: [],
        metadata: {},
      }),
    ).toBe(false)
    expect(
      isCustomerFacingFiatCorridorLive({
        enabled: true,
        provider_routing: [],
        metadata: { pay_in_mode: "va" },
      }),
    ).toBe(true)
    expect(
      isCustomerFacingFiatCorridorLive({
        enabled: false,
        provider_routing: [{ provider: "grid", priority: 1 }],
        metadata: { grid_send_enabled: true },
      }),
    ).toBe(false)
  })
})

describe("pickPublicPayInMetadata", () => {
  it("includes US pay-in mode and Express flag", () => {
    expect(
      pickPublicPayInMetadata({
        pay_in_mode: "va",
        stripe_express_enabled: false,
        grid_receive_enabled: true,
        secret: "nope",
      }),
    ).toEqual({
      pay_in_mode: "va",
      stripe_express_enabled: false,
      grid_receive_enabled: true,
    })
  })
})

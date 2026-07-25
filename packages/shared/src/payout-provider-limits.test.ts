import { describe, expect, it } from "vitest"
import {
  isYcBalancePayoutCorridor,
  isGridBalancePayoutCorridor,
  resolvePrimaryPayoutProvider,
} from "./payout-corridor"
import {
  resolvePayInProvider,
  validateBalancePayoutAmountForProvider,
  validatePayInAmountForProvider,
} from "./payout-provider-limits"

describe("resolvePrimaryPayoutProvider", () => {
  it("sorts by priority before choosing primary provider", () => {
    expect(
      resolvePrimaryPayoutProvider([
        { provider: "noah", priority: 2, settlement_asset: "USDC" },
        { provider: "yellowcard", priority: 1, settlement_asset: "USDC" },
      ]),
    ).toBe("yellowcard")
  })
})

describe("isYcBalancePayoutCorridor", () => {
  it("treats Yellowcard priority 1 as YC balance payout even when array is unsorted", () => {
    expect(
      isYcBalancePayoutCorridor({
        provider_routing: [
          { provider: "noah", priority: 2, settlement_asset: "USDC" },
          { provider: "yellowcard", priority: 1, settlement_asset: "USDC" },
        ],
      }),
    ).toBe(true)
  })
})

describe("resolvePayInProvider", () => {
  it("prefers Yellowcard pay-in when Noah is payout primary on dual corridor", () => {
    expect(
      resolvePayInProvider({
        providerRouting: [
          { provider: "noah", priority: 1, settlement_asset: "USDC" },
          { provider: "yellowcard", priority: 2, settlement_asset: "USDC" },
        ],
        metadata: {
          yc_receive: true,
          yc_receive_enabled: true,
          yc_send: true,
          noah_receive: false,
        },
      }),
    ).toBe("yellowcard")
  })

  it("requires grid_receive_enabled for Grid pay-in", () => {
    expect(
      resolvePayInProvider({
        metadata: { grid_receive: true, grid_receive_enabled: false },
      }),
    ).not.toBe("grid")
    expect(
      resolvePayInProvider({
        metadata: { grid_receive: true, grid_receive_enabled: true },
      }),
    ).toBe("grid")
  })

  it("prefers grid_receive_enabled over stale yc_receive capability flag", () => {
    expect(
      resolvePayInProvider({
        providerRouting: [{ provider: "grid", priority: 1, settlement_asset: "USDC" }],
        metadata: {
          yc_receive: true,
          yc_receive_enabled: false,
          grid_receive: true,
          grid_receive_enabled: true,
        },
      }),
    ).toBe("grid")
  })

  it("does not treat grid-only payout corridors as Noah payout locked", () => {
    expect(
      resolvePayInProvider({
        providerRouting: [{ provider: "grid", priority: 1, settlement_asset: "USDC" }],
        metadata: {
          grid_send: true,
          grid_send_enabled: true,
          grid_receive: true,
          grid_receive_enabled: true,
        },
      }),
    ).toBe("grid")
  })
})

describe("validatePayInAmountForProvider", () => {
  it("uses Yellowcard pay-in minimums when YC is pay-in provider", () => {
    const result = validatePayInAmountForProvider({
      provider: "yellowcard",
      localPayIn: 1000,
      currency: "NGN",
      ycLimits: { minLocalPayIn: 2500, maxLocalPayIn: 5_000_000 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("2,500")
  })

  it("uses Noah pay-in minimums when Noah is pay-in provider", () => {
    const result = validatePayInAmountForProvider({
      provider: "noah",
      localPayIn: 500,
      currency: "NGN",
      noahHints: { amount_field_mode: "note_optional_only", limits: { min: "1000" } },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("1,000")
  })

  it("rejects Grid pay-in below configured limits", () => {
    const result = validatePayInAmountForProvider({
      provider: "grid",
      localPayIn: 100,
      currency: "NGN",
      gridLimits: { minLocalPayIn: 2500, maxLocalPayIn: 5_000_000 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("2,500")
  })

  it("allows Grid pay-in when no limits are configured", () => {
    const result = validatePayInAmountForProvider({
      provider: "grid",
      localPayIn: 100,
      currency: "GHS",
    })
    expect(result.ok).toBe(true)
  })
})

describe("validateBalancePayoutAmountForProvider", () => {
  it("uses Yellowcard minimums when Yellowcard is primary", () => {
    const result = validateBalancePayoutAmountForProvider({
      providerRouting: [
        { provider: "yellowcard", priority: 1, settlement_asset: "USDC" },
        { provider: "noah", priority: 2, settlement_asset: "USDC" },
      ],
      sourceBalanceCurrency: "USD",
      receiveAmount: 1000,
      receiveCurrency: "NGN",
      customerRate: 1500,
      ycLimits: {
        minSendUsd: 1.01,
        minLocalReceive: 2000,
        maxLocalReceive: 30_000_000,
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain("2,000")
    }
  })

  it("uses Noah minimums when Noah is primary", () => {
    const result = validateBalancePayoutAmountForProvider({
      providerRouting: [
        { provider: "noah", priority: 1, settlement_asset: "USDC" },
        { provider: "yellowcard", priority: 2, settlement_asset: "USDC" },
      ],
      sourceBalanceCurrency: "USD",
      receiveAmount: 1000,
      receiveCurrency: "NGN",
      noahHints: { amount_field_mode: "note_optional_only", limits: { min: "500" } },
    })
    expect(result.ok).toBe(true)
  })
})

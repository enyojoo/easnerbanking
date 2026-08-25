import { describe, expect, it } from "vitest"
import { preflightCorridorRoutingPatch } from "./corridor-routing-preflight"

describe("preflightCorridorRoutingPatch", () => {
  it("allows empty routing (payout disabled)", () => {
    expect(
      preflightCorridorRoutingPatch({
        providerRouting: [],
        metadata: {},
        fieldsSchema: null,
      }),
    ).toEqual([])
  })

  it("rejects Yellowcard primary without ready schema", () => {
    const issues = preflightCorridorRoutingPatch({
      providerRouting: [{ provider: "yellowcard", priority: 1 }],
      metadata: { yc_send_enabled: true },
      fieldsSchema: { yellowcard: { status: "pending_schema", channel_type: "bank" } },
    })
    expect(issues.some((i) => i.code === "SCHEMA_PENDING")).toBe(true)
  })

  it("accepts Yellowcard primary with ready schema and send enabled", () => {
    const issues = preflightCorridorRoutingPatch({
      providerRouting: [{ provider: "yellowcard", priority: 1 }],
      metadata: { yc_send_enabled: true },
      fieldsSchema: {
        yellowcard: { status: "ready", channel_type: "bank", bank_enum: ["Access Bank"] },
      },
    })
    expect(issues).toEqual([])
  })

  it("rejects send flag mismatch", () => {
    const issues = preflightCorridorRoutingPatch({
      providerRouting: [{ provider: "grid", priority: 1 }],
      metadata: { grid_send_enabled: false },
      fieldsSchema: { grid: { status: "ready", channel_type: "bank" } },
    })
    expect(issues.some((i) => i.code === "SEND_FLAG_DISABLED")).toBe(true)
  })

  it("allows metadata-only live toggle off while stored routing still names a provider", () => {
    const issues = preflightCorridorRoutingPatch({
      metadata: { yc_send_enabled: false, yc_receive_enabled: false },
      existing: {
        provider_routing: [{ provider: "yellowcard", priority: 1 }],
        metadata: {
          pay_in_provider: "yellowcard",
          yc_send_enabled: true,
          yc_receive_enabled: true,
          yc_send: true,
          yc_receive: true,
        },
      },
    })
    expect(issues).toEqual([])
  })

  it("allows disabling pay-in without stale pay_in_provider from existing row", () => {
    const issues = preflightCorridorRoutingPatch({
      metadata: {
        yc_receive_enabled: false,
        yc_receive: false,
        yc_send_enabled: true,
      },
      existing: {
        provider_routing: [{ provider: "yellowcard", priority: 1 }],
        metadata: {
          pay_in_provider: "yellowcard",
          yc_receive_enabled: true,
          yc_receive: true,
        },
      },
    })
    expect(issues).toEqual([])
  })
})

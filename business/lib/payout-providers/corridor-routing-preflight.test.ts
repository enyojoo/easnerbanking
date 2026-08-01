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
})

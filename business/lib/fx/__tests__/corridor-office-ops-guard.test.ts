import { describe, expect, it } from "vitest"
import {
  corridorHasConfiguredGridOps,
  gridCapabilityMetadataChanged,
  mergeGridCapabilityMetadataForSync,
  mergeYcCapabilityMetadataForSync,
} from "../corridor-office-ops-guard"

describe("corridor-office-ops-guard", () => {
  it("mergeGridCapabilityMetadataForSync sets capability without touching Office flags", () => {
    const merged = mergeGridCapabilityMetadataForSync({
      grid_send_enabled: false,
      grid_receive_enabled: false,
      yc_send_enabled: true,
    })
    expect(merged.grid_send).toBe(true)
    expect(merged.grid_receive).toBe(true)
    expect(merged.grid_send_enabled).toBe(false)
    expect(merged.grid_receive_enabled).toBe(false)
    expect(merged.yc_send_enabled).toBe(true)
  })

  it("mergeYcCapabilityMetadataForSync only marks supported ramps", () => {
    const merged = mergeYcCapabilityMetadataForSync(
      { yc_receive_enabled: false },
      { ycSend: true, ycReceive: false },
    )
    expect(merged.yc_send).toBe(true)
    expect(merged.yc_receive).toBeUndefined()
    expect(merged.yc_receive_enabled).toBe(false)
  })

  it("corridorHasConfiguredGridOps ignores provider capability flags", () => {
    expect(corridorHasConfiguredGridOps({ grid_send: true, grid_receive: true })).toBe(false)
    expect(corridorHasConfiguredGridOps({ grid_send_enabled: true })).toBe(true)
    expect(
      corridorHasConfiguredGridOps({
        cross_border_enabled: true,
        cross_border_provider: "grid",
      }),
    ).toBe(true)
  })

  it("gridCapabilityMetadataChanged detects missing capability markers", () => {
    expect(gridCapabilityMetadataChanged({}, { grid_send: true, grid_receive: true })).toBe(true)
    expect(
      gridCapabilityMetadataChanged(
        { grid_send: true, grid_receive: true },
        { grid_send: true, grid_receive: true },
      ),
    ).toBe(false)
  })
})

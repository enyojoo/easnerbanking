import { describe, expect, it } from "vitest"
import {
  isCustomerFacingFiatCorridorLive,
  resolveOfficePayInProvider,
  resolveOfficePayoutProvider,
} from "./payout-corridor"
import {
  mergeCorridorMetadataSurfaces,
  patchCorridorSurfaceRouting,
  projectCorridorForSurface,
  readCorridorSurfaceRouting,
  routingSurfaceFromUserRole,
} from "./corridor-surface-routing"

const gridPayout = {
  provider_routing: [{ provider: "grid", priority: 1, settlement_asset: "USDC" }],
  metadata: { grid_send_enabled: true, grid_receive_enabled: true },
}

describe("routingSurfaceFromUserRole", () => {
  it("maps individual to personal and everyone else to business", () => {
    expect(routingSurfaceFromUserRole("individual")).toBe("personal")
    expect(routingSurfaceFromUserRole("business")).toBe("business")
    expect(routingSurfaceFromUserRole(null)).toBe("business")
  })
})

describe("readCorridorSurfaceRouting fallback", () => {
  it("clones the current global choice onto both surfaces when overlay is missing", () => {
    expect(readCorridorSurfaceRouting(gridPayout, "business")).toEqual(
      readCorridorSurfaceRouting(gridPayout, "personal"),
    )
    expect(readCorridorSurfaceRouting(gridPayout, "business").payout).toBe("grid")
    expect(readCorridorSurfaceRouting(gridPayout, "personal").pay_in).toBe("grid")
    expect(resolveOfficePayoutProvider(gridPayout)).toBe("grid")
    expect(resolveOfficePayInProvider(gridPayout.metadata)).toBe("grid")
  })
})

describe("patchCorridorSurfaceRouting write isolation", () => {
  it("updates legacy routing and surfaces.business on a Business write", () => {
    const next = patchCorridorSurfaceRouting(gridPayout, "business", { payout: "noah" })
    expect(next.provider_routing[0]?.provider).toBe("noah")
    expect(next.metadata.noah_send_enabled).toBe(true)
    expect(next.metadata.grid_send_enabled).toBe(false)
    const surfaces = next.metadata.surfaces as { business: { payout: string }; personal: { payout: string } }
    expect(surfaces.business.payout).toBe("noah")
    expect(surfaces.personal.payout).toBe("grid")
  })

  it("does not change provider_routing on a Mobile write", () => {
    const next = patchCorridorSurfaceRouting(gridPayout, "personal", { payout: "yellowcard" })
    expect(next.provider_routing).toEqual(gridPayout.provider_routing)
    expect(next.metadata.grid_send_enabled).toBe(true)
    const surfaces = next.metadata.surfaces as { business: { payout: string }; personal: { payout: string } }
    expect(surfaces.personal.payout).toBe("yellowcard")
    expect(surfaces.business.payout).toBe("grid")
  })
})

describe("isCustomerFacingFiatCorridorLive per surface", () => {
  it("can be live for Business and off for Mobile", () => {
    const input = {
      enabled: true as const,
      provider_routing: [{ provider: "noah", priority: 1 }],
      metadata: {
        noah_send_enabled: true,
        surfaces: {
          business: { payout: "noah", pay_in: null, cross_border: null },
          personal: { payout: null, pay_in: null, cross_border: null },
        },
      },
    }
    expect(isCustomerFacingFiatCorridorLive(input, "business")).toBe(true)
    expect(isCustomerFacingFiatCorridorLive(input, "personal")).toBe(false)
    expect(isCustomerFacingFiatCorridorLive(input)).toBe(true)
  })
})

describe("projectCorridorForSurface identity", () => {
  it("keeps existing payout, pay-in, and cross-border when overlay is missing", () => {
    const input = {
      provider_routing: [{ provider: "yellowcard", priority: 1, settlement_asset: "USDC" }],
      metadata: {
        yc_send_enabled: true,
        yc_receive_enabled: true,
        cross_border_enabled: true,
        cross_border_provider: "yellowcard",
      },
    }
    for (const surface of ["business", "personal"] as const) {
      const projected = projectCorridorForSurface(input, surface)
      expect(projected.provider_routing[0]?.provider).toBe("yellowcard")
      expect(projected.metadata.pay_in_provider).toBe("yellowcard")
      expect(projected.metadata.cross_border_enabled).toBe(true)
      expect(projected.metadata.cross_border_provider).toBe("yellowcard")
    }
  })

  it("does not turn off cross-border when the flag is on without a stored provider", () => {
    const projected = projectCorridorForSurface(
      {
        provider_routing: [],
        metadata: { cross_border_enabled: true, yc_receive_enabled: true },
      },
      "personal",
    )
    expect(projected.metadata.cross_border_enabled).toBe(true)
  })
})

describe("projectCorridorForSurface", () => {
  it("projects different routing by role", () => {
    const input = {
      provider_routing: [{ provider: "noah", priority: 1, settlement_asset: "USDC" }],
      metadata: {
        noah_send_enabled: true,
        surfaces: {
          business: { payout: "noah", pay_in: "noah", cross_border: null },
          personal: { payout: "grid", pay_in: "grid", cross_border: null },
        },
      },
    }
    const business = projectCorridorForSurface(input, "business")
    const personal = projectCorridorForSurface(input, "personal")
    expect(business.provider_routing[0]?.provider).toBe("noah")
    expect(personal.provider_routing[0]?.provider).toBe("grid")
    expect(business.metadata.pay_in_provider).toBe("noah")
    expect(personal.metadata.pay_in_provider).toBe("grid")
    expect(business.metadata.surfaces).toBeUndefined()
  })
})

describe("mergeCorridorMetadataSurfaces", () => {
  it("keeps surfaces.personal when sync merges capability metadata", () => {
    const existing = {
      yc_receive_enabled: false,
      surfaces: {
        business: { payout: "noah", pay_in: null, cross_border: null },
        personal: { payout: "yellowcard", pay_in: "yellowcard", cross_border: null },
      },
    }
    const merged = mergeCorridorMetadataSurfaces({ yc_send: true }, existing)
    expect(merged.surfaces).toEqual(existing.surfaces)
    expect(
      (merged.surfaces as { personal: { payout: string } }).personal.payout,
    ).toBe("yellowcard")
  })
})

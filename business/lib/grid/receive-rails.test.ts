import { describe, expect, it, vi, beforeEach } from "vitest"
import { resolveGridReceiveRailAvailability, resolveGridPayInNetworks } from "./receive-rails"

vi.mock("@/lib/grid/discoveries", () => ({
  listGridDiscoveries: vi.fn(),
  gridDiscoverySupportsCorridor: vi.fn(
    ({ countryCode, currencyCode, rail }: { countryCode: string; currencyCode: string; rail: string }) =>
      countryCode === "GH" && currencyCode === "GHS" && rail === "mobile_money",
  ),
  isMomoGridDiscovery: vi.fn((d: { displayName?: string }) =>
    String(d.displayName ?? "").includes("MTN"),
  ),
}))

vi.mock("@/lib/yellowcard/yc-receive-gate", () => ({
  corridorGridReceiveEnabled: vi.fn(
    (metadata: Record<string, unknown>) =>
      metadata.grid_receive === true && metadata.grid_receive_enabled === true,
  ),
}))

describe("resolveGridReceiveRailAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("marks mobile_money available when corridor and discovery match", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  limit: async () => ({
                    data: [
                      {
                        metadata: { grid_receive: true, grid_receive_enabled: true },
                        enabled: true,
                        rail: "mobile_money",
                      },
                    ],
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }

    const { listGridDiscoveries } = await import("@/lib/grid/discoveries")
    vi.mocked(listGridDiscoveries).mockResolvedValue([
      { country: "GH", currency: "GHS", displayName: "MTN MoMo" },
    ])

    const rails = await resolveGridReceiveRailAvailability(admin as never, {
      countryCode: "GH",
      currencyCode: "GHS",
    })

    expect(rails.mobile_money.available).toBe(true)
    expect(rails.mobile_money.minLocalPayIn).toBe(20)
    expect(rails.mobile_money.maxLocalPayIn).toBeNull()
    expect(rails.bank_transfer.available).toBe(false)
  })
})

describe("resolveGridPayInNetworks", () => {
  it("maps momo discoveries to network options", async () => {
    const { listGridDiscoveries } = await import("@/lib/grid/discoveries")
    vi.mocked(listGridDiscoveries).mockResolvedValue([
      { country: "GH", currency: "GHS", displayName: "MTN MoMo" },
    ])

    const networks = await resolveGridPayInNetworks({ country: "GH", currency: "GHS" })
    expect(networks).toHaveLength(1)
    expect(networks[0]?.name).toBe("MTN MoMo")
    expect(networks[0]?.id).toContain("grid_GH_GHS")
  })
})

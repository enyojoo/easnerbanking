import { describe, expect, it, beforeEach, vi } from "vitest"

vi.mock("./channels", () => ({
  listYellowcardChannels: vi.fn(),
}))

import { listYellowcardChannels } from "./channels"
import { clearYcChannelCache, getYcCorridorCapabilities } from "./channel-availability"

describe("getYcCorridorCapabilities", () => {
  beforeEach(() => {
    clearYcChannelCache()
    vi.mocked(listYellowcardChannels).mockReset()
  })

  it("detects PH PHP bank send from YC withdraw channel", async () => {
    vi.mocked(listYellowcardChannels).mockResolvedValue([
      {
        id: "109b40ff-887c-4441-9c0b-19bd6b4be18f",
        country: "PH",
        currency: "PHP",
        channelType: "bank",
        rampType: "withdraw",
        status: "active",
        apiStatus: "active",
      },
    ])

    await expect(
      getYcCorridorCapabilities({
        country: "PH",
        currency: "PHP",
        rail: "bank_transfer",
      }),
    ).resolves.toEqual({ yc_send: true, yc_receive: false })
  })
})

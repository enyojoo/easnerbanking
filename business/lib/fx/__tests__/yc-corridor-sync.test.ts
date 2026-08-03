import { describe, expect, it } from "vitest"
import { collectYcCorridorTargets } from "../yc-corridor-sync"
import type { YcChannel } from "@/lib/yellowcard/channels"

describe("collectYcCorridorTargets", () => {
  it("includes Philippines PHP bank send from active withdraw channel", () => {
    const channels: YcChannel[] = [
      {
        id: "109b40ff-887c-4441-9c0b-19bd6b4be18f",
        country: "PH",
        currency: "PHP",
        channelType: "bank",
        rampType: "withdraw",
        status: "active",
        apiStatus: "active",
      },
    ]

    expect(collectYcCorridorTargets(channels)).toEqual([
      {
        countryCode: "PH",
        currencyCode: "PHP",
        rail: "bank_transfer",
        ycSend: true,
        ycReceive: false,
      },
    ])
  })
})

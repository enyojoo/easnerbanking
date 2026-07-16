import { describe, expect, it } from "vitest"
import {
  findYcReceiveChannel,
  isYcReceiveChannelActive,
} from "@/lib/yellowcard/receive-rails"
import type { YcChannel } from "@/lib/yellowcard/channels"

const KE_MOMO_DISABLED: YcChannel = {
  id: "71700f34-c42a-4b61-96a4-db79f6d5684b",
  country: "KE",
  currency: "KES",
  channelType: "momo",
  rampType: "deposit",
  status: "disabled",
  apiStatus: "active",
}

const KE_MOMO_ACTIVE: YcChannel = {
  id: "active-ke-momo",
  country: "KE",
  currency: "KES",
  channelType: "momo",
  rampType: "deposit",
  status: "active",
  apiStatus: "active",
}

describe("isYcReceiveChannelActive", () => {
  it("rejects disabled channels", () => {
    expect(isYcReceiveChannelActive(KE_MOMO_DISABLED)).toBe(false)
  })

  it("accepts active deposit channels", () => {
    expect(isYcReceiveChannelActive(KE_MOMO_ACTIVE)).toBe(true)
  })
})

describe("findYcReceiveChannel", () => {
  it("skips disabled channels and picks an active match", () => {
    const channel = findYcReceiveChannel([KE_MOMO_DISABLED, KE_MOMO_ACTIVE], {
      country: "KE",
      currency: "KES",
      rail: "mobile_money",
    })
    expect(channel?.id).toBe("active-ke-momo")
  })

  it("returns null when only disabled channels exist", () => {
    const channel = findYcReceiveChannel([KE_MOMO_DISABLED], {
      country: "KE",
      currency: "KES",
      rail: "mobile_money",
    })
    expect(channel).toBeNull()
  })
})

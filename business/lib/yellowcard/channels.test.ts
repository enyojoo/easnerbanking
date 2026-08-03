import { describe, expect, it } from "vitest"
import { readYcResponseChannelId, toYcChannelType } from "./channels"

describe("toYcChannelType", () => {
  it("maps supported rails to Yellowcard channel types", () => {
    expect(toYcChannelType("bank_transfer")).toBe("bank")
    expect(toYcChannelType("mobile_money")).toBe("momo")
  })
})

describe("readYcResponseChannelId", () => {
  it("reads camel- and snake-case response fields", () => {
    expect(readYcResponseChannelId({ channelId: " routed-1 " })).toBe("routed-1")
    expect(readYcResponseChannelId({ channel_id: "routed-2" })).toBe("routed-2")
  })

  it("returns null when Yellowcard omits the routed channel", () => {
    expect(readYcResponseChannelId({})).toBeNull()
    expect(readYcResponseChannelId(null)).toBeNull()
  })
})

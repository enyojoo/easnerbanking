import { describe, expect, it } from "vitest"
import { readYcResponseChannelId, toYcChannelType, ycSubmitChannelTypeFromChannel } from "./channels"

describe("toYcChannelType", () => {
  it("maps supported rails to Yellowcard channel types", () => {
    expect(toYcChannelType("bank_transfer")).toBe("bank")
    expect(toYcChannelType("mobile_money")).toBe("momo")
  })
})

describe("ycSubmitChannelTypeFromChannel", () => {
  it("submits bank or momo, not catalog p2p/eft labels", () => {
    expect(ycSubmitChannelTypeFromChannel({ channelType: "eft" }, "bank_transfer")).toBe("bank")
    expect(ycSubmitChannelTypeFromChannel({ channelType: "bank" }, "bank_transfer")).toBe("bank")
    expect(ycSubmitChannelTypeFromChannel({ channelType: "p2p" }, "bank_transfer")).toBe("bank")
    expect(ycSubmitChannelTypeFromChannel({ channelType: "p2pmomo" }, "mobile_money")).toBe("momo")
    expect(ycSubmitChannelTypeFromChannel({ channelType: "momo" }, "mobile_money")).toBe("momo")
    expect(ycSubmitChannelTypeFromChannel({}, "bank_transfer")).toBe("bank")
    expect(ycSubmitChannelTypeFromChannel({}, "mobile_money")).toBe("momo")
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

import { describe, expect, it } from "vitest"
import { readYcResponseChannelId, toYcChannelType, ycSubmitChannelTypeFromChannel } from "./channels"

describe("toYcChannelType", () => {
  it("maps supported rails to Yellowcard channel types", () => {
    expect(toYcChannelType("bank_transfer")).toBe("bank")
    expect(toYcChannelType("mobile_money")).toBe("momo")
  })
})

describe("ycSubmitChannelTypeFromChannel", () => {
  it("maps live Instant EFT channels to eft", () => {
    expect(ycSubmitChannelTypeFromChannel({ channelType: "eft" }, "bank_transfer")).toBe("eft")
    expect(ycSubmitChannelTypeFromChannel({ channelType: "bank" }, "bank_transfer")).toBe("bank")
    expect(ycSubmitChannelTypeFromChannel({ channelType: "p2p" }, "bank_transfer")).toBe("p2p")
    expect(ycSubmitChannelTypeFromChannel({ channelType: "p2pmomo" }, "mobile_money")).toBe("momo")
    expect(ycSubmitChannelTypeFromChannel({ channelType: "momo" }, "mobile_money")).toBe("momo")
    expect(ycSubmitChannelTypeFromChannel({}, "bank_transfer")).toBe("bank")
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

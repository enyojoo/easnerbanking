import { describe, expect, it } from "vitest"
import { pickYcSendNetworkId } from "./yc-network-resolve"

const CHANNEL = "ch-ngn-send"

const networks = [
  {
    id: "net-access",
    name: "Access Bank Nigeria",
    status: "active",
    channelIds: [CHANNEL],
  },
  {
    id: "net-manual",
    name: "Manual Input",
    status: "active",
    channelIds: [CHANNEL],
  },
  {
    id: "net-other-channel",
    name: "Other Bank",
    status: "active",
    channelIds: ["other-channel"],
  },
]

describe("pickYcSendNetworkId", () => {
  it("matches bank name within channel scope", () => {
    expect(
      pickYcSendNetworkId({
        networks,
        channelId: CHANNEL,
        bankName: "Access Bank",
        isMomo: false,
      }),
    ).toBe("net-access")
  })

  it("falls back to Manual Input when bank name does not match", () => {
    expect(
      pickYcSendNetworkId({
        networks,
        channelId: CHANNEL,
        bankName: "GTBank",
        isMomo: false,
      }),
    ).toBe("net-manual")
  })

  it("scopes networks to channelId before matching", () => {
    expect(
      pickYcSendNetworkId({
        networks,
        channelId: CHANNEL,
        bankName: "Other Bank",
        isMomo: false,
      }),
    ).toBe("net-manual")
  })

  it("matches mobile provider for momo sends", () => {
    expect(
      pickYcSendNetworkId({
        networks: [
          { id: "net-mtn", name: "MTN Mobile Money", status: "active", channelIds: [CHANNEL] },
        ],
        channelId: CHANNEL,
        mobileProvider: "MTN",
        isMomo: true,
      }),
    ).toBe("net-mtn")
  })

  it("falls back to the first Brazil Pix network when no bank matches", () => {
    expect(
      pickYcSendNetworkId({
        networks: [
          { id: "net-pix-a", name: "PIX", status: "active" },
          { id: "net-pix-b", name: "PIX Alt", status: "active" },
        ],
        bankName: "Unlisted Bank",
        isMomo: false,
        fallbackToFirst: true,
      }),
    ).toBe("net-pix-a")
  })
})

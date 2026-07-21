import { describe, expect, it } from "vitest"
import {
  resolveYcChannelDepositWindowMs,
  resolveYcPayInDepositExpiresAt,
} from "./yc-channel-deposit-window"

describe("yc channel deposit window", () => {
  it("uses 4 hours for Nigeria bank transfer", () => {
    expect(resolveYcChannelDepositWindowMs("NG", "bank_transfer")).toBe(4 * 60 * 60 * 1000)
  })

  it("uses 10 minutes for mobile money", () => {
    expect(resolveYcChannelDepositWindowMs("NG", "mobile_money")).toBe(10 * 60 * 1000)
  })

  it("prefers YC API expiry when provided", () => {
    const preferred = "2099-06-01T12:00:00.000Z"
    expect(
      resolveYcPayInDepositExpiresAt({
        lockedAt: "2026-01-01T00:00:00.000Z",
        preferredExpiresAt: preferred,
        country: "NG",
        payInRail: "bank_transfer",
      }),
    ).toBe(preferred)
  })

  it("computes expiry from lock + channel window", () => {
    expect(
      resolveYcPayInDepositExpiresAt({
        lockedAt: "2026-01-01T00:00:00.000Z",
        country: "NG",
        payInRail: "bank_transfer",
      }),
    ).toBe("2026-01-01T04:00:00.000Z")
  })

  it("uses YC POST /receive expiry when provided (authoritative)", () => {
    expect(
      resolveYcPayInDepositExpiresAt({
        lockedAt: "2026-01-01T00:00:00.000Z",
        preferredExpiresAt: "2026-01-01T00:10:00.000Z",
        country: "NG",
        payInRail: "bank_transfer",
      }),
    ).toBe("2026-01-01T00:10:00.000Z")
  })
})

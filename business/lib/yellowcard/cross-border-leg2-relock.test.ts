import { describe, expect, it } from "vitest"
import {
  assessYcCrossBorderRelockFunding,
  isYcSendStillFundable,
} from "./cross-border-leg2-relock"

describe("YC cross-border leg2 relock safety", () => {
  it("reuses a pending unexpired destination send", () => {
    expect(
      isYcSendStillFundable({
        status: "PENDING_APPROVAL",
        expiresAt: "2030-01-01T00:00:00.000Z",
        nowMs: new Date("2029-01-01T00:00:00.000Z").getTime(),
      }),
    ).toBe(true)
  })

  it.each(["EXPIRED", "FAILED", "CANCELLED", "REJECTED"])(
    "requires relock for %s",
    (status) => expect(isYcSendStillFundable({ status })).toBe(false),
  )

  it("allows a relock gap only from this transfer's revenue and available omnibus", () => {
    expect(
      assessYcCrossBorderRelockFunding({
        oldCryptoAmount: 100,
        newCryptoAmount: 100.5,
        processingFee: 0.3,
        marginAmount: 0.3,
        omnibusAvailable: 101,
      }),
    ).toMatchObject({ ok: true, relockGap: 0.5, revenueAvailable: 0.6 })
  })

  it("fails closed instead of underfunding when revenue or omnibus is insufficient", () => {
    expect(
      assessYcCrossBorderRelockFunding({
        oldCryptoAmount: 100,
        newCryptoAmount: 101,
        processingFee: 0.2,
        marginAmount: 0.2,
        omnibusAvailable: 100.8,
      }).ok,
    ).toBe(false)
  })
})

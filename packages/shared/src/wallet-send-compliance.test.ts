import { describe, expect, it } from "vitest"
import {
  dailyLimitUsdForTier,
  evaluateVelocityTrigger,
  resolveWalletSendDailyTier,
  velocityCapUsd,
  walletSendDailyLimitCopy,
  walletSendVelocityLimitCopy,
  sendComplianceContinueBlockedCopy,
} from "./wallet-send-compliance"

describe("evaluateVelocityTrigger", () => {
  const now = Date.parse("2026-09-01T18:00:00.000Z")

  it("fires on a single inbound of $10k", () => {
    const result = evaluateVelocityTrigger(
      [{ amountUsd: 10_000, creditedAt: "2026-09-01T17:00:00.000Z" }],
      now,
    )
    expect(result.triggered).toBe(true)
    expect(result.reason).toBe("single_inbound_10k")
    expect(result.maxSendUsd).toBe(2_000)
  })

  it("fires on 48h aggregate of $10k without a $10k single", () => {
    const result = evaluateVelocityTrigger(
      [
        { amountUsd: 4_000, creditedAt: "2026-08-31T20:00:00.000Z" },
        { amountUsd: 6_000, creditedAt: "2026-09-01T12:00:00.000Z" },
      ],
      now,
    )
    expect(result.triggered).toBe(true)
    expect(result.reason).toBe("aggregate_48h_10k")
    expect(result.maxSendUsd).toBe(2_000)
  })

  it("fires on same-day bit-sized structuring", () => {
    const result = evaluateVelocityTrigger(
      [
        { amountUsd: 2_000, creditedAt: "2026-09-01T10:00:00.000Z" },
        { amountUsd: 2_000, creditedAt: "2026-09-01T12:00:00.000Z" },
        { amountUsd: 1_500, creditedAt: "2026-09-01T14:00:00.000Z" },
      ],
      now,
    )
    expect(result.triggered).toBe(true)
    expect(result.reason).toBe("structuring_same_day")
    expect(result.maxSendUsd).toBe(1_100)
  })

  it("fires on 5 credits / 48h totaling $7.5k", () => {
    const result = evaluateVelocityTrigger(
      [
        { amountUsd: 1_500, creditedAt: "2026-08-31T20:00:00.000Z" },
        { amountUsd: 1_500, creditedAt: "2026-08-31T22:00:00.000Z" },
        { amountUsd: 1_500, creditedAt: "2026-09-01T08:00:00.000Z" },
        { amountUsd: 1_500, creditedAt: "2026-09-01T10:00:00.000Z" },
        { amountUsd: 1_500, creditedAt: "2026-09-01T12:00:00.000Z" },
      ],
      now,
    )
    expect(result.triggered).toBe(true)
    expect(result.reason).toBe("structuring_48h")
    expect(result.maxSendUsd).toBe(1_500)
  })

  it("does not fire below thresholds", () => {
    const result = evaluateVelocityTrigger(
      [
        { amountUsd: 2_000, creditedAt: "2026-09-01T10:00:00.000Z" },
        { amountUsd: 2_000, creditedAt: "2026-09-01T12:00:00.000Z" },
      ],
      now,
    )
    expect(result.triggered).toBe(false)
  })

  it("ignores credits older than 48h", () => {
    const result = evaluateVelocityTrigger(
      [{ amountUsd: 50_000, creditedAt: "2026-08-29T17:00:00.000Z" }],
      now,
    )
    expect(result.triggered).toBe(false)
  })
})

describe("resolveWalletSendDailyTier", () => {
  const now = Date.parse("2026-09-01T00:00:00.000Z")

  it("classifies young accounts under 90 days", () => {
    expect(
      resolveWalletSendDailyTier({
        businessCreatedAt: "2026-07-01T00:00:00.000Z",
        now,
      }),
    ).toBe("young")
    expect(dailyLimitUsdForTier("young")).toBe(10_000)
  })

  it("classifies established accounts with a clean 90 days", () => {
    expect(
      resolveWalletSendDailyTier({
        businessCreatedAt: "2025-01-01T00:00:00.000Z",
        now,
      }),
    ).toBe("established")
    expect(dailyLimitUsdForTier("established")).toBe(50_000)
  })

  it("keeps standard when a recent velocity trigger exists", () => {
    expect(
      resolveWalletSendDailyTier({
        businessCreatedAt: "2025-01-01T00:00:00.000Z",
        lastVelocityTriggerAt: "2026-08-15T00:00:00.000Z",
        now,
      }),
    ).toBe("standard")
    expect(dailyLimitUsdForTier("standard")).toBe(25_000)
  })
})

describe("sendComplianceContinueBlockedCopy", () => {
  const stablecoinBase = {
    allowed: true,
    remainingUsd: 5_000,
    dailyLimitUsd: 25_000,
    dailyUsedUsd: 20_000,
    dailyRemainingUsd: 5_000,
    dailyTier: "standard" as const,
    velocityActive: false,
    velocityRemainingUsd: null,
    velocityExpiresAt: null,
    velocityMode: null,
    code: null,
    message: null,
  }

  it("returns daily copy when stablecoin amount exceeds allowance", () => {
    expect(
      sendComplianceContinueBlockedCopy({
        stablecoin: stablecoinBase,
        fiatPayout: stablecoinBase,
        velocityEnforced: false,
        amountUsd: 6_000,
        isWalletSend: true,
      }),
    ).toMatch(/daily external transfer limit/)
  })

  it("returns velocity copy when velocity is the tighter cap", () => {
    expect(
      sendComplianceContinueBlockedCopy({
        stablecoin: {
          ...stablecoinBase,
          remainingUsd: 1_000,
          velocityActive: true,
          velocityRemainingUsd: 1_000,
          velocityMode: "enforce",
        },
        fiatPayout: stablecoinBase,
        velocityEnforced: true,
        amountUsd: 1_500,
        isWalletSend: true,
      }),
    ).toMatch(/under review/)
  })

  it("returns null when within allowance", () => {
    expect(
      sendComplianceContinueBlockedCopy({
        stablecoin: stablecoinBase,
        fiatPayout: stablecoinBase,
        velocityEnforced: false,
        amountUsd: 1_000,
        isWalletSend: true,
      }),
    ).toBeNull()
  })
})

describe("copy", () => {
  it("includes retry time for daily limit", () => {
    expect(walletSendDailyLimitCopy("2026-09-02T12:00:00.000Z")).toMatch(/Bank transfers/)
  })

  it("includes expiry for velocity limit", () => {
    expect(walletSendVelocityLimitCopy("2026-09-03T12:00:00.000Z")).toMatch(/limited until/)
  })

  it("computes 20% cap", () => {
    expect(velocityCapUsd(50_000, 20)).toBe(10_000)
  })
})

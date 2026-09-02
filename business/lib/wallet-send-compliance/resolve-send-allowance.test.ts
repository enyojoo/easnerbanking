import { describe, expect, it } from "vitest"
import {
  WALLET_SEND_DAILY_LIMIT_CODE,
  WALLET_SEND_VELOCITY_LIMIT_CODE,
} from "@easner/shared"
import { computeStablecoinAllowance } from "./resolve-send-allowance"
import { shouldEscalateRepeat } from "./notify-velocity"

describe("computeStablecoinAllowance", () => {
  const base = {
    dailyLimitUsd: 10_000,
    dailyUsedUsd: 2_000,
    dailyRetryAfterIso: "2026-09-02T12:00:00.000Z",
    dailyTier: "young" as const,
    velocityRemainingUsd: 1_500,
    velocityExpiresAt: "2026-09-03T12:00:00.000Z",
    velocityMode: "enforce" as const,
  }

  it("takes min(daily remaining, velocity remaining) when velocity is enforced", () => {
    const result = computeStablecoinAllowance({
      ...base,
      amountUsd: 1_000,
      velocityEnforced: true,
    })
    expect(result.allowed).toBe(true)
    expect(result.remainingUsd).toBe(1_500)
    expect(result.dailyRemainingUsd).toBe(8_000)
  })

  it("denies with velocity code when velocity is the tighter cap", () => {
    const result = computeStablecoinAllowance({
      ...base,
      amountUsd: 2_000,
      velocityEnforced: true,
    })
    expect(result.allowed).toBe(false)
    expect(result.code).toBe(WALLET_SEND_VELOCITY_LIMIT_CODE)
  })

  it("skips the velocity cap in shadow mode", () => {
    const result = computeStablecoinAllowance({
      ...base,
      amountUsd: 2_000,
      velocityEnforced: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.remainingUsd).toBe(8_000)
    expect(result.code).toBeNull()
  })

  it("denies with daily code when daily remaining is tighter", () => {
    const result = computeStablecoinAllowance({
      ...base,
      dailyUsedUsd: 9_500,
      velocityRemainingUsd: 8_000,
      amountUsd: 600,
      velocityEnforced: true,
    })
    expect(result.allowed).toBe(false)
    expect(result.code).toBe(WALLET_SEND_DAILY_LIMIT_CODE)
    expect(result.remainingUsd).toBe(500)
  })
})

describe("shouldEscalateRepeat", () => {
  it("escalates at two triggers in 30 days", () => {
    expect(shouldEscalateRepeat(1, 2)).toBe(false)
    expect(shouldEscalateRepeat(2, 2)).toBe(true)
    expect(shouldEscalateRepeat(5, 2)).toBe(true)
  })
})

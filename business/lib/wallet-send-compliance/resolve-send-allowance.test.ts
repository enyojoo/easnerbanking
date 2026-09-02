import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  FIAT_PAYOUT_DAILY_LIMIT_CODE,
  FIAT_PAYOUT_DAILY_LIMIT_USD,
  WALLET_SEND_DAILY_LIMIT_CODE,
  WALLET_SEND_VELOCITY_LIMIT_CODE,
} from "@easner/shared"
import {
  computeFiatPayoutAllowance,
  computeStablecoinAllowance,
  resolveSendAllowance,
} from "./resolve-send-allowance"
import { shouldEscalateRepeat } from "./notify-velocity"

vi.mock("./platform-enabled", () => ({
  isWalletSendCompliancePlatformEnabled: vi.fn(async () => true),
}))

vi.mock("./resolve-daily-usage", () => ({
  sumRolling24hOutboundUsd: vi.fn(async () => ({ usedUsd: 1_000, oldestCountedAt: null })),
  dailyRetryAfterIso: vi.fn(() => null),
}))

vi.mock("./resolve-limit-override", () => ({
  loadActiveLimitOverride: vi.fn(async () => null),
}))

vi.mock("./resolve-daily-tier", () => ({
  resolveBusinessDailyTier: vi.fn(async () => ({ tier: "standard", limitUsd: 10_000 })),
}))

vi.mock("./velocity-store", () => ({
  loadActiveVelocityControl: vi.fn(async () => null),
}))

vi.mock("./config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config")>()
  return {
    ...actual,
    isVelocityOutboundEnforced: vi.fn(() => false),
  }
})

import { isWalletSendCompliancePlatformEnabled } from "./platform-enabled"
import { sumRolling24hOutboundUsd } from "./resolve-daily-usage"
import { loadActiveLimitOverride } from "./resolve-limit-override"

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

describe("computeFiatPayoutAllowance", () => {
  it("allows amounts under the shared fiat daily remaining", () => {
    const result = computeFiatPayoutAllowance({
      amountUsd: 500,
      dailyLimitUsd: FIAT_PAYOUT_DAILY_LIMIT_USD,
      dailyUsedUsd: 1_000,
      dailyRetryAfterIso: null,
    })
    expect(result.allowed).toBe(true)
    expect(result.code).toBeNull()
    expect(result.dailyRemainingUsd).toBe(FIAT_PAYOUT_DAILY_LIMIT_USD - 1_000)
  })

  it("denies with fiat payout code when over remaining", () => {
    const result = computeFiatPayoutAllowance({
      amountUsd: 2_000,
      dailyLimitUsd: 5_000,
      dailyUsedUsd: 4_000,
      dailyRetryAfterIso: "2026-09-03T00:00:00.000Z",
    })
    expect(result.allowed).toBe(false)
    expect(result.code).toBe(FIAT_PAYOUT_DAILY_LIMIT_CODE)
    expect(result.message).toBeTruthy()
  })
})

describe("resolveSendAllowance fiat_payout", () => {
  beforeEach(() => {
    vi.mocked(isWalletSendCompliancePlatformEnabled).mockResolvedValue(true)
    vi.mocked(sumRolling24hOutboundUsd).mockResolvedValue({ usedUsd: 1_000, oldestCountedAt: null })
    vi.mocked(loadActiveLimitOverride).mockResolvedValue(null)
  })

  it("resolves fiat limits from config without undefined cfg (Noah/YC/Grid shared rail)", async () => {
    const admin = {} as never
    const result = await resolveSendAllowance(admin, {
      businessId: "biz_1",
      rail: "fiat_payout",
      amountUsd: 100,
    })
    expect(result.allowed).toBe(true)
    expect(result.dailyLimitUsd).toBe(FIAT_PAYOUT_DAILY_LIMIT_USD)
    expect(result.dailyUsedUsd).toBe(1_000)
    expect(sumRolling24hOutboundUsd).toHaveBeenCalledWith(
      admin,
      "biz_1",
      "fiat_payout",
      expect.any(Number),
    )
  })

  it("honors fiat override over default daily limit", async () => {
    vi.mocked(loadActiveLimitOverride).mockResolvedValue({ dailyMaxUsd: 250 } as never)
    const result = await resolveSendAllowance({} as never, {
      businessId: "biz_1",
      rail: "fiat_payout",
      amountUsd: 300,
    })
    expect(result.allowed).toBe(false)
    expect(result.dailyLimitUsd).toBe(250)
    expect(result.code).toBe(FIAT_PAYOUT_DAILY_LIMIT_CODE)
  })
})

describe("shouldEscalateRepeat", () => {
  it("escalates at two triggers in 30 days", () => {
    expect(shouldEscalateRepeat(1, 2)).toBe(false)
    expect(shouldEscalateRepeat(2, 2)).toBe(true)
    expect(shouldEscalateRepeat(5, 2)).toBe(true)
  })
})

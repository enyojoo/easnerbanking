import type { SupabaseClient } from "@supabase/supabase-js"
import {
  emptySendAllowance,
  FIAT_PAYOUT_DAILY_LIMIT_CODE,
  fiatPayoutDailyLimitCopy,
  roundUsd,
  WALLET_SEND_DAILY_LIMIT_CODE,
  WALLET_SEND_VELOCITY_LIMIT_CODE,
  walletSendDailyLimitCopy,
  walletSendVelocityLimitCopy,
  type ResolvedSendAllowance,
  type WalletSendComplianceRail,
  type WalletSendDailyTier,
  type WalletSendVelocityMode,
} from "@easner/shared"
import { isVelocityOutboundEnforced, walletSendComplianceConfig } from "./config"
import { isWalletSendCompliancePlatformEnabled } from "./platform-enabled"
import { resolveBusinessDailyTier } from "./resolve-daily-tier"
import { dailyRetryAfterIso, sumRolling24hOutboundUsd } from "./resolve-daily-usage"
import { loadActiveLimitOverride } from "./resolve-limit-override"
import { loadActiveVelocityControl } from "./velocity-store"

export function computeStablecoinAllowance(input: {
  amountUsd: number
  dailyLimitUsd: number
  dailyUsedUsd: number
  dailyRetryAfterIso: string | null
  dailyTier: WalletSendDailyTier
  velocityRemainingUsd: number | null
  velocityExpiresAt: string | null
  velocityMode: WalletSendVelocityMode | null
  velocityEnforced: boolean
}): ResolvedSendAllowance {
  const dailyRemainingUsd = Math.max(0, roundUsd(input.dailyLimitUsd - input.dailyUsedUsd))
  let remainingUsd = dailyRemainingUsd
  if (input.velocityEnforced && input.velocityRemainingUsd != null) {
    remainingUsd = Math.min(remainingUsd, input.velocityRemainingUsd)
  }
  const allowed = input.amountUsd <= remainingUsd + 1e-6
  let code: string | null = null
  let message: string | null = null
  if (!allowed) {
    if (
      input.velocityEnforced &&
      input.velocityRemainingUsd != null &&
      input.amountUsd > input.velocityRemainingUsd
    ) {
      code = WALLET_SEND_VELOCITY_LIMIT_CODE
      message = walletSendVelocityLimitCopy(input.velocityExpiresAt)
    } else {
      code = WALLET_SEND_DAILY_LIMIT_CODE
      message = walletSendDailyLimitCopy(input.dailyRetryAfterIso)
    }
  }
  return {
    allowed,
    remainingUsd,
    dailyLimitUsd: input.dailyLimitUsd,
    dailyUsedUsd: input.dailyUsedUsd,
    dailyRemainingUsd,
    dailyTier: input.dailyTier,
    velocityActive: input.velocityRemainingUsd != null,
    velocityRemainingUsd: input.velocityRemainingUsd,
    velocityExpiresAt: input.velocityExpiresAt,
    velocityMode: input.velocityMode,
    code,
    message,
  }
}

export async function resolveSendAllowance(
  admin: SupabaseClient,
  input: {
    businessId: string | null | undefined
    rail: WalletSendComplianceRail
    amountUsd: number
    now?: number
  },
): Promise<ResolvedSendAllowance> {
  const businessId = String(input.businessId || "").trim()
  if (!businessId) return emptySendAllowance()
  if (!(await isWalletSendCompliancePlatformEnabled(admin))) return emptySendAllowance()
  const now = input.now ?? Date.now()
  const amountUsd = Math.max(0, input.amountUsd)

  if (input.rail === "fiat_payout") {
    const cfg = walletSendComplianceConfig()
    const [usage, override] = await Promise.all([
      sumRolling24hOutboundUsd(admin, businessId, "fiat_payout", now),
      loadActiveLimitOverride(admin, businessId, "fiat_payout", now),
    ])
    const dailyLimitUsd = override?.dailyMaxUsd ?? cfg.fiatDailyUsd
    const dailyUsedUsd = usage.usedUsd
    const dailyRemainingUsd = Math.max(0, Math.round((dailyLimitUsd - dailyUsedUsd) * 100) / 100)
    const allowed = amountUsd <= dailyRemainingUsd + 1e-6
    const retryAfter = dailyRetryAfterIso(usage.oldestCountedAt, now)
    return {
      allowed,
      remainingUsd: dailyRemainingUsd,
      dailyLimitUsd,
      dailyUsedUsd,
      dailyRemainingUsd,
      dailyTier: null,
      velocityActive: false,
      velocityRemainingUsd: null,
      velocityExpiresAt: null,
      velocityMode: null,
      code: allowed ? null : FIAT_PAYOUT_DAILY_LIMIT_CODE,
      message: allowed ? null : fiatPayoutDailyLimitCopy(retryAfter),
    }
  }

  const [tier, usage, override, velocity] = await Promise.all([
    resolveBusinessDailyTier(admin, businessId, now),
    sumRolling24hOutboundUsd(admin, businessId, "stablecoin", now),
    loadActiveLimitOverride(admin, businessId, "stablecoin", now),
    loadActiveVelocityControl(admin, businessId, now),
  ])

  const dailyLimitUsd = override?.dailyMaxUsd ?? tier.limitUsd
  const dailyUsedUsd = usage.usedUsd
  const retryAfter = dailyRetryAfterIso(usage.oldestCountedAt, now)
  const velocityRemainingUsd = velocity
    ? Math.max(0, roundUsd(velocity.max_send_usd - velocity.sent_usd))
    : null
  const velocityActive = velocityRemainingUsd != null
  const velocityEnforced = isVelocityOutboundEnforced(velocityActive)

  return computeStablecoinAllowance({
    amountUsd,
    dailyLimitUsd,
    dailyUsedUsd,
    dailyRetryAfterIso: retryAfter,
    dailyTier: tier.tier,
    velocityRemainingUsd,
    velocityExpiresAt: velocity?.expires_at ?? null,
    velocityMode: velocityEnforced ? "enforce" : (velocity?.mode ?? null),
    velocityEnforced,
  })
}

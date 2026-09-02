export const WALLET_SEND_DAILY_LIMIT_CODE = "WALLET_SEND_DAILY_LIMIT" as const
export const FIAT_PAYOUT_DAILY_LIMIT_CODE = "FIAT_PAYOUT_DAILY_LIMIT" as const
export const WALLET_SEND_VELOCITY_LIMIT_CODE = "WALLET_SEND_VELOCITY_LIMIT" as const

export const WALLET_SEND_COMPLIANCE_STATUS_LABEL = "Velocity limit" as const

export type WalletSendComplianceRail = "stablecoin" | "fiat_payout"
export type WalletSendInboundSource = "grid_va" | "grid_fund_balance" | "noah_bank_onramp" | "on_chain"
export type WalletSendVelocityMode = "shadow" | "enforce"
export type WalletSendDailyTier = "young" | "standard" | "established"

export type VelocityTriggerReason =
  | "single_inbound_10k"
  | "aggregate_48h_10k"
  | "structuring_same_day"
  | "structuring_48h"
  | "early_outbound_attempt"

export const WALLET_SEND_DAILY_LIMIT_YOUNG_USD = 10_000
export const WALLET_SEND_DAILY_LIMIT_STANDARD_USD = 25_000
export const WALLET_SEND_DAILY_LIMIT_ESTABLISHED_USD = 50_000
export const WALLET_SEND_YOUNG_ACCOUNT_MAX_AGE_DAYS = 90
export const WALLET_SEND_ESTABLISHED_CLEAN_DAYS = 90
export const FIAT_PAYOUT_DAILY_LIMIT_USD = 100_000

export const WALLET_SEND_VELOCITY_SINGLE_INBOUND_USD = 10_000
export const WALLET_SEND_VELOCITY_AGGREGATE_48H_USD = 10_000
export const WALLET_SEND_VELOCITY_STRUCTURING_MIN_COUNT_DAY = 3
export const WALLET_SEND_VELOCITY_STRUCTURING_MIN_DAY_USD = 5_000
export const WALLET_SEND_VELOCITY_STRUCTURING_MIN_COUNT_48H = 5
export const WALLET_SEND_VELOCITY_STRUCTURING_MIN_48H_USD = 7_500
export const WALLET_SEND_VELOCITY_CAP_PCT = 20
export const WALLET_SEND_VELOCITY_CAP_PCT_BOOSTED = 10
export const WALLET_SEND_VELOCITY_EARLY_OUTBOUND_HOURS = 6
export const WALLET_SEND_VELOCITY_EARLY_OUTBOUND_MIN_INBOUND_USD = 5_000
export const WALLET_SEND_VELOCITY_WINDOW_HOURS = 48
export const WALLET_SEND_VELOCITY_REPEAT_WINDOW_DAYS = 30
export const WALLET_SEND_VELOCITY_REPEAT_THRESHOLD = 2

export type WalletSendInboundCredit = {
  amountUsd: number
  creditedAt: string
}

export type VelocityTriggerResult = {
  triggered: boolean
  reason: VelocityTriggerReason | null
  inboundTotalUsd: number
  maxSendUsd: number
  capPct: number
}

export type ResolvedSendAllowance = {
  allowed: boolean
  remainingUsd: number
  dailyLimitUsd: number
  dailyUsedUsd: number
  dailyRemainingUsd: number
  dailyTier: WalletSendDailyTier | null
  velocityActive: boolean
  velocityRemainingUsd: number | null
  velocityExpiresAt: string | null
  velocityMode: WalletSendVelocityMode | null
  code: string | null
  message: string | null
}

export function emptySendAllowance(): ResolvedSendAllowance {
  return {
    allowed: true,
    remainingUsd: Number.POSITIVE_INFINITY,
    dailyLimitUsd: 0,
    dailyUsedUsd: 0,
    dailyRemainingUsd: Number.POSITIVE_INFINITY,
    dailyTier: null,
    velocityActive: false,
    velocityRemainingUsd: null,
    velocityExpiresAt: null,
    velocityMode: null,
    code: null,
    message: null,
  }
}

export function roundUsd(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100) / 100
}

export function velocityCapUsd(inboundTotalUsd: number, capPct: number): number {
  return roundUsd((Math.max(0, inboundTotalUsd) * capPct) / 100)
}

export function calendarDayKey(iso: string, timeZone = "UTC"): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ""
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms))
}

export function evaluateVelocityTrigger(
  credits: WalletSendInboundCredit[],
  now = Date.now(),
  opts?: {
    singleInboundUsd?: number
    aggregate48hUsd?: number
    structuringMinCountDay?: number
    structuringMinDayUsd?: number
    structuringMinCount48h?: number
    structuringMin48hUsd?: number
    windowHours?: number
    capPct?: number
  },
): VelocityTriggerResult {
  const single = opts?.singleInboundUsd ?? WALLET_SEND_VELOCITY_SINGLE_INBOUND_USD
  const aggregate48h = opts?.aggregate48hUsd ?? WALLET_SEND_VELOCITY_AGGREGATE_48H_USD
  const minCountDay = opts?.structuringMinCountDay ?? WALLET_SEND_VELOCITY_STRUCTURING_MIN_COUNT_DAY
  const minDayUsd = opts?.structuringMinDayUsd ?? WALLET_SEND_VELOCITY_STRUCTURING_MIN_DAY_USD
  const minCount48h = opts?.structuringMinCount48h ?? WALLET_SEND_VELOCITY_STRUCTURING_MIN_COUNT_48H
  const min48hUsd = opts?.structuringMin48hUsd ?? WALLET_SEND_VELOCITY_STRUCTURING_MIN_48H_USD
  const windowHours = opts?.windowHours ?? WALLET_SEND_VELOCITY_WINDOW_HOURS
  const capPct = opts?.capPct ?? WALLET_SEND_VELOCITY_CAP_PCT
  const windowStart = now - windowHours * 60 * 60 * 1000

  const inWindow = credits.filter((c) => {
    const ms = Date.parse(c.creditedAt)
    return Number.isFinite(ms) && ms >= windowStart && ms <= now && c.amountUsd > 0
  })

  const inboundTotalUsd = roundUsd(inWindow.reduce((sum, c) => sum + c.amountUsd, 0))
  const maxSingle = inWindow.reduce((max, c) => Math.max(max, c.amountUsd), 0)
  const count48h = inWindow.length

  const todayKey = calendarDayKey(new Date(now).toISOString())
  const sameDay = inWindow.filter((c) => calendarDayKey(c.creditedAt) === todayKey)
  const sameDayTotal = roundUsd(sameDay.reduce((sum, c) => sum + c.amountUsd, 0))

  let reason: VelocityTriggerReason | null = null
  if (maxSingle >= single) reason = "single_inbound_10k"
  else if (inboundTotalUsd >= aggregate48h) reason = "aggregate_48h_10k"
  else if (sameDay.length >= minCountDay && sameDayTotal >= minDayUsd) reason = "structuring_same_day"
  else if (count48h >= minCount48h && inboundTotalUsd >= min48hUsd) reason = "structuring_48h"

  if (!reason) {
    return {
      triggered: false,
      reason: null,
      inboundTotalUsd,
      maxSendUsd: 0,
      capPct,
    }
  }

  const inboundForCap =
    reason === "structuring_same_day" ? sameDayTotal : inboundTotalUsd

  return {
    triggered: true,
    reason,
    inboundTotalUsd: inboundForCap,
    maxSendUsd: velocityCapUsd(inboundForCap, capPct),
    capPct,
  }
}

export function resolveWalletSendDailyTier(input: {
  businessCreatedAt: string | null | undefined
  now?: number
  youngMaxAgeDays?: number
  cleanDays?: number
  lastVelocityTriggerAt?: string | null
  lastRestrictionAt?: string | null
}): WalletSendDailyTier {
  const now = input.now ?? Date.now()
  const youngDays = input.youngMaxAgeDays ?? WALLET_SEND_YOUNG_ACCOUNT_MAX_AGE_DAYS
  const cleanDays = input.cleanDays ?? WALLET_SEND_ESTABLISHED_CLEAN_DAYS
  const createdMs = input.businessCreatedAt ? Date.parse(input.businessCreatedAt) : Number.NaN
  const ageDays = Number.isFinite(createdMs) ? (now - createdMs) / (24 * 60 * 60 * 1000) : 0
  if (ageDays < youngDays) return "young"

  const cleanMs = cleanDays * 24 * 60 * 60 * 1000
  const velocityMs = input.lastVelocityTriggerAt ? Date.parse(input.lastVelocityTriggerAt) : Number.NaN
  const restrictionMs = input.lastRestrictionAt ? Date.parse(input.lastRestrictionAt) : Number.NaN
  const recentIssue =
    (Number.isFinite(velocityMs) && now - velocityMs < cleanMs) ||
    (Number.isFinite(restrictionMs) && now - restrictionMs < cleanMs)
  return recentIssue ? "standard" : "established"
}

export function dailyLimitUsdForTier(tier: WalletSendDailyTier): number {
  if (tier === "young") return WALLET_SEND_DAILY_LIMIT_YOUNG_USD
  if (tier === "established") return WALLET_SEND_DAILY_LIMIT_ESTABLISHED_USD
  return WALLET_SEND_DAILY_LIMIT_STANDARD_USD
}

export function walletSendDailyLimitCopy(retryAfterIso?: string | null): string {
  const when = retryAfterIso ? formatWalletSendComplianceTime(retryAfterIso) : null
  if (when) {
    return `You’ve reached your daily external transfer limit. You can send again after ${when}. Bank transfers are still available.`
  }
  return "You’ve reached your daily external transfer limit. Bank transfers are still available."
}

export function fiatPayoutDailyLimitCopy(retryAfterIso?: string | null): string {
  const when = retryAfterIso ? formatWalletSendComplianceTime(retryAfterIso) : null
  if (when) {
    return `You’ve reached your daily bank transfer limit. You can send again after ${when}.`
  }
  return "You’ve reached your daily bank transfer limit."
}

export function walletSendVelocityLimitCopy(expiresAt?: string | null): string {
  const when = expiresAt ? formatWalletSendComplianceTime(expiresAt) : null
  if (when) {
    return `Recent large deposits are under review. External stablecoin sends are limited until ${when}. Bank transfers are still available.`
  }
  return "Recent large deposits are under review. External stablecoin sends are limited. Bank transfers are still available."
}

export function formatWalletSendComplianceTime(iso: string | null | undefined, locale = "en-US"): string {
  if (!iso) return ""
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ""
  return new Date(ms).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function walletSendVelocityBannerCopy(expiresAt?: string | null): string {
  return walletSendVelocityLimitCopy(expiresAt)
}

export function isWalletSendComplianceCode(code: string | null | undefined): boolean {
  return (
    code === WALLET_SEND_DAILY_LIMIT_CODE ||
    code === FIAT_PAYOUT_DAILY_LIMIT_CODE ||
    code === WALLET_SEND_VELOCITY_LIMIT_CODE
  )
}

export function sendExceedsComplianceAllowance(
  allowance: ResolvedSendAllowance,
  amountUsd: number,
): boolean {
  if (!Number.isFinite(allowance.remainingUsd)) return false
  return amountUsd > allowance.remainingUsd + 1e-6
}

/** Proactive Continue-block copy when amount exceeds daily or velocity allowance. */
export function sendComplianceContinueBlockedCopy(input: {
  stablecoin: ResolvedSendAllowance
  fiatPayout: ResolvedSendAllowance
  velocityEnforced: boolean
  amountUsd: number
  isWalletSend: boolean
}): string | null {
  const allowance = input.isWalletSend ? input.stablecoin : input.fiatPayout
  if (!sendExceedsComplianceAllowance(allowance, input.amountUsd)) return null
  if (input.isWalletSend) {
    if (
      input.velocityEnforced &&
      allowance.velocityRemainingUsd != null &&
      input.amountUsd > allowance.velocityRemainingUsd + 1e-6
    ) {
      return walletSendVelocityLimitCopy(allowance.velocityExpiresAt)
    }
    return walletSendDailyLimitCopy(null)
  }
  return fiatPayoutDailyLimitCopy(null)
}

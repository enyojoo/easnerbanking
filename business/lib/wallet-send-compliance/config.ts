import {
  FIAT_PAYOUT_DAILY_LIMIT_USD,
  WALLET_SEND_DAILY_LIMIT_ESTABLISHED_USD,
  WALLET_SEND_DAILY_LIMIT_STANDARD_USD,
  WALLET_SEND_DAILY_LIMIT_YOUNG_USD,
  WALLET_SEND_ESTABLISHED_CLEAN_DAYS,
  WALLET_SEND_VELOCITY_AGGREGATE_48H_USD,
  WALLET_SEND_VELOCITY_CAP_PCT,
  WALLET_SEND_VELOCITY_CAP_PCT_BOOSTED,
  WALLET_SEND_VELOCITY_EARLY_OUTBOUND_HOURS,
  WALLET_SEND_VELOCITY_EARLY_OUTBOUND_MIN_INBOUND_USD,
  WALLET_SEND_VELOCITY_REPEAT_THRESHOLD,
  WALLET_SEND_VELOCITY_REPEAT_WINDOW_DAYS,
  WALLET_SEND_VELOCITY_SINGLE_INBOUND_USD,
  WALLET_SEND_VELOCITY_STRUCTURING_MIN_48H_USD,
  WALLET_SEND_VELOCITY_STRUCTURING_MIN_COUNT_48H,
  WALLET_SEND_VELOCITY_STRUCTURING_MIN_COUNT_DAY,
  WALLET_SEND_VELOCITY_STRUCTURING_MIN_DAY_USD,
  WALLET_SEND_VELOCITY_WINDOW_HOURS,
  WALLET_SEND_YOUNG_ACCOUNT_MAX_AGE_DAYS,
} from "@easner/shared"

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (raw === "1" || raw === "true" || raw === "yes") return true
  if (raw === "0" || raw === "false" || raw === "no") return false
  return fallback
}

/** Active velocity controls cap outbound stablecoin sends unless shadow mode is explicitly enabled. */
export function isVelocityOutboundEnforced(velocityActive: boolean): boolean {
  if (!velocityActive) return false
  return !walletSendComplianceConfig().shadowMode
}

export function walletSendComplianceConfig() {
  return {
    dailyYoungUsd: envNumber("WALLET_SEND_DAILY_LIMIT_YOUNG_USD", WALLET_SEND_DAILY_LIMIT_YOUNG_USD),
    dailyStandardUsd: envNumber(
      "WALLET_SEND_DAILY_LIMIT_STANDARD_USD",
      WALLET_SEND_DAILY_LIMIT_STANDARD_USD,
    ),
    dailyEstablishedUsd: envNumber(
      "WALLET_SEND_DAILY_LIMIT_ESTABLISHED_USD",
      WALLET_SEND_DAILY_LIMIT_ESTABLISHED_USD,
    ),
    youngMaxAgeDays: envNumber(
      "WALLET_SEND_YOUNG_ACCOUNT_MAX_AGE_DAYS",
      WALLET_SEND_YOUNG_ACCOUNT_MAX_AGE_DAYS,
    ),
    establishedCleanDays: envNumber(
      "WALLET_SEND_ESTABLISHED_CLEAN_DAYS",
      WALLET_SEND_ESTABLISHED_CLEAN_DAYS,
    ),
    fiatDailyUsd: envNumber("FIAT_PAYOUT_DAILY_LIMIT_USD", FIAT_PAYOUT_DAILY_LIMIT_USD),
    singleInboundUsd: envNumber(
      "WALLET_SEND_VELOCITY_SINGLE_INBOUND_USD",
      WALLET_SEND_VELOCITY_SINGLE_INBOUND_USD,
    ),
    aggregate48hUsd: envNumber(
      "WALLET_SEND_VELOCITY_AGGREGATE_48H_USD",
      WALLET_SEND_VELOCITY_AGGREGATE_48H_USD,
    ),
    structuringMinCountDay: envNumber(
      "WALLET_SEND_VELOCITY_STRUCTURING_MIN_COUNT_DAY",
      WALLET_SEND_VELOCITY_STRUCTURING_MIN_COUNT_DAY,
    ),
    structuringMinDayUsd: envNumber(
      "WALLET_SEND_VELOCITY_STRUCTURING_MIN_DAY_USD",
      WALLET_SEND_VELOCITY_STRUCTURING_MIN_DAY_USD,
    ),
    structuringMinCount48h: envNumber(
      "WALLET_SEND_VELOCITY_STRUCTURING_MIN_COUNT_48H",
      WALLET_SEND_VELOCITY_STRUCTURING_MIN_COUNT_48H,
    ),
    structuringMin48hUsd: envNumber(
      "WALLET_SEND_VELOCITY_STRUCTURING_MIN_48H_USD",
      WALLET_SEND_VELOCITY_STRUCTURING_MIN_48H_USD,
    ),
    capPct: envNumber("WALLET_SEND_VELOCITY_CAP_PCT", WALLET_SEND_VELOCITY_CAP_PCT),
    capPctBoosted: envNumber(
      "WALLET_SEND_VELOCITY_CAP_PCT_BOOSTED",
      WALLET_SEND_VELOCITY_CAP_PCT_BOOSTED,
    ),
    earlyOutboundHours: envNumber(
      "WALLET_SEND_VELOCITY_EARLY_OUTBOUND_HOURS",
      WALLET_SEND_VELOCITY_EARLY_OUTBOUND_HOURS,
    ),
    earlyOutboundMinInboundUsd: envNumber(
      "WALLET_SEND_VELOCITY_EARLY_OUTBOUND_MIN_INBOUND_USD",
      WALLET_SEND_VELOCITY_EARLY_OUTBOUND_MIN_INBOUND_USD,
    ),
    windowHours: envNumber("WALLET_SEND_VELOCITY_WINDOW_HOURS", WALLET_SEND_VELOCITY_WINDOW_HOURS),
    shadowMode: envBool("WALLET_SEND_VELOCITY_SHADOW_MODE", false),
    repeatWindowDays: envNumber(
      "WALLET_SEND_VELOCITY_REPEAT_WINDOW_DAYS",
      WALLET_SEND_VELOCITY_REPEAT_WINDOW_DAYS,
    ),
    repeatThreshold: envNumber(
      "WALLET_SEND_VELOCITY_REPEAT_THRESHOLD",
      WALLET_SEND_VELOCITY_REPEAT_THRESHOLD,
    ),
  }
}

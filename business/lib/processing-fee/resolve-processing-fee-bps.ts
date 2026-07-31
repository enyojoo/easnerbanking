import type { SupabaseClient } from "@supabase/supabase-js"
import { DEFAULT_PAYOUT_PROCESSING_FEE_BPS } from "@easner/shared"
import type {
  ProcessingFeeDirection,
  ProcessingFeeScheduleScope,
} from "@/lib/admin/processing-fee-schedule-service"

export type FiatProcessingFeeRail = "bank_transfer" | "mobile_money"

export type ProcessingFeeSubjectContext = {
  userId?: string | null
  businessId?: string | null
}

export type ResolveFiatProcessingFeeInput = ProcessingFeeSubjectContext & {
  rail: FiatProcessingFeeRail
  countryCode: string
  currencyCode: string
  direction: ProcessingFeeDirection
}

export type ResolveCryptoProcessingFeeInput = ProcessingFeeSubjectContext & {
  assetCode: string
  direction: Extract<ProcessingFeeDirection, "pay_in" | "pay_out">
}

type OverrideRow = {
  pay_in_bps: number | null
  pay_out_bps: number | null
  cross_border_bps: number | null
}

const CACHE_TTL_MS = 60_000

type CacheEntry = { bps: number; expiresAt: number }

const scheduleCache = new Map<string, CacheEntry>()
const overrideCache = new Map<string, OverrideRow | null>()
const userBusinessCache = new Map<string, { businessId: string | null; expiresAt: number }>()

function scopeForRail(rail: FiatProcessingFeeRail): ProcessingFeeScheduleScope {
  return rail === "mobile_money" ? "fiat_mobile_money" : "fiat_bank"
}

function cacheKey(parts: string[]): string {
  return parts.join("|")
}

function readScheduleCache(key: string): number | null {
  const hit = scheduleCache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    scheduleCache.delete(key)
    return null
  }
  return hit.bps
}

function writeScheduleCache(key: string, bps: number): void {
  scheduleCache.set(key, { bps, expiresAt: Date.now() + CACHE_TTL_MS })
}

function readOverrideCache(key: string): OverrideRow | null | undefined {
  const hit = overrideCache.get(key)
  if (hit === undefined) return undefined
  return hit
}

function writeOverrideCache(key: string, row: OverrideRow | null): void {
  overrideCache.set(key, row)
  setTimeout(() => overrideCache.delete(key), CACHE_TTL_MS)
}

function bpsFromScheduleRow(
  row: Record<string, unknown> | null | undefined,
  direction: ProcessingFeeDirection,
): number {
  if (!row) return DEFAULT_PAYOUT_PROCESSING_FEE_BPS
  const field =
    direction === "pay_in"
      ? "pay_in_bps"
      : direction === "pay_out"
        ? "pay_out_bps"
        : "cross_border_bps"
  const n = Number(row[field])
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PAYOUT_PROCESSING_FEE_BPS
  return Math.round(n)
}

function directionField(direction: ProcessingFeeDirection): keyof OverrideRow {
  if (direction === "pay_in") return "pay_in_bps"
  if (direction === "pay_out") return "pay_out_bps"
  return "cross_border_bps"
}

function bpsFromOverrideRow(
  row: OverrideRow | null | undefined,
  direction: ProcessingFeeDirection,
): number | null {
  if (!row) return null
  const value = row[directionField(direction)]
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

async function loadOverride(
  admin: SupabaseClient,
  subjectType: "user" | "business",
  subjectId: string,
): Promise<OverrideRow | null> {
  const key = cacheKey(["override", subjectType, subjectId])
  const cached = readOverrideCache(key)
  if (cached !== undefined) return cached

  const { data, error } = await admin
    .from("processing_fee_overrides")
    .select("pay_in_bps,pay_out_bps,cross_border_bps")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .maybeSingle()

  if (error) throw error

  const row = data
    ? {
        pay_in_bps: data.pay_in_bps == null ? null : Number(data.pay_in_bps),
        pay_out_bps: data.pay_out_bps == null ? null : Number(data.pay_out_bps),
        cross_border_bps: data.cross_border_bps == null ? null : Number(data.cross_border_bps),
      }
    : null

  writeOverrideCache(key, row)
  return row
}

async function resolveBusinessIdForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const cached = userBusinessCache.get(userId)
  if (cached && Date.now() <= cached.expiresAt) return cached.businessId

  const { data, error } = await admin
    .from("users")
    .select("easner_business_id")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw error

  const businessId = data?.easner_business_id ? String(data.easner_business_id) : null
  userBusinessCache.set(userId, { businessId, expiresAt: Date.now() + CACHE_TTL_MS })
  return businessId
}

async function resolveSubjectOverrideBps(
  admin: SupabaseClient,
  input: ProcessingFeeSubjectContext,
  direction: ProcessingFeeDirection,
): Promise<number | null> {
  const userId = input.userId ? String(input.userId).trim() : ""
  let businessId = input.businessId ? String(input.businessId).trim() : ""

  if (userId) {
    const userBps = bpsFromOverrideRow(await loadOverride(admin, "user", userId), direction)
    if (userBps != null) return userBps
  }

  if (!businessId && userId) {
    businessId = (await resolveBusinessIdForUser(admin, userId)) ?? ""
  }

  if (businessId) {
    const businessBps = bpsFromOverrideRow(await loadOverride(admin, "business", businessId), direction)
    if (businessBps != null) return businessBps
  }

  return null
}

async function resolveScheduleFiatBps(
  admin: SupabaseClient,
  input: Omit<ResolveFiatProcessingFeeInput, keyof ProcessingFeeSubjectContext>,
): Promise<number> {
  const cc = String(input.countryCode ?? "").trim().toUpperCase()
  const cur = String(input.currencyCode ?? "").trim().toUpperCase()
  const scope = scopeForRail(input.rail)
  const key = cacheKey(["schedule", scope, cc, cur, input.direction])

  const cached = readScheduleCache(key)
  if (cached != null) return cached

  const { data, error } = await admin
    .from("processing_fee_schedule")
    .select("pay_in_bps,pay_out_bps,cross_border_bps")
    .eq("scope", scope)
    .eq("country_code", cc)
    .eq("currency_code", cur)
    .maybeSingle()

  if (error) throw error

  const bps = bpsFromScheduleRow(data as Record<string, unknown> | null, input.direction)
  writeScheduleCache(key, bps)
  return bps
}

async function resolveScheduleCryptoBps(
  admin: SupabaseClient,
  input: Omit<ResolveCryptoProcessingFeeInput, keyof ProcessingFeeSubjectContext>,
): Promise<number> {
  const asset = String(input.assetCode ?? "").trim().toUpperCase()
  const key = cacheKey(["schedule", "crypto", asset, input.direction])

  const cached = readScheduleCache(key)
  if (cached != null) return cached

  const { data, error } = await admin
    .from("processing_fee_schedule")
    .select("pay_in_bps,pay_out_bps")
    .eq("scope", "crypto")
    .eq("asset_code", asset)
    .maybeSingle()

  if (error) throw error

  const bps = bpsFromScheduleRow(data as Record<string, unknown> | null, input.direction)
  writeScheduleCache(key, bps)
  return bps
}

export function clearProcessingFeeBpsCache(): void {
  scheduleCache.clear()
  overrideCache.clear()
  userBusinessCache.clear()
}

export async function resolveFiatProcessingFeeBps(
  admin: SupabaseClient,
  input: ResolveFiatProcessingFeeInput,
): Promise<number> {
  const subjectBps = await resolveSubjectOverrideBps(admin, input, input.direction)
  if (subjectBps != null) return subjectBps

  return resolveScheduleFiatBps(admin, {
    rail: input.rail,
    countryCode: input.countryCode,
    currencyCode: input.currencyCode,
    direction: input.direction,
  })
}

export async function resolveCryptoProcessingFeeBps(
  admin: SupabaseClient,
  input: ResolveCryptoProcessingFeeInput,
): Promise<number> {
  const subjectBps = await resolveSubjectOverrideBps(admin, input, input.direction)
  if (subjectBps != null) return subjectBps

  return resolveScheduleCryptoBps(admin, {
    assetCode: input.assetCode,
    direction: input.direction,
  })
}

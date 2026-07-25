import type { SupabaseClient } from "@supabase/supabase-js"
import { currencyDisplayName, countryDisplayName } from "@easner/shared"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { isExcludedPayoutCorridorCountry, isExcludedPayoutCorridorTarget } from "@/lib/payout-corridors-exclusions"
import { upsertPayoutCorridor } from "@/lib/payout-corridors-upsert"

export type YcCorridorTarget = {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
  ycSend: boolean
  ycReceive: boolean
}

export type YcCorridorSyncResult = {
  ok: boolean
  inserted: number
  updated: number
  skipped: number
  targets: number
  error?: string
}

function corridorTargetKey(t: YcCorridorTarget): string {
  return `${t.countryCode}:${t.currencyCode}:${t.rail}`
}

function countryDisplayNameFromCode(code: string): string {
  return countryDisplayName(code.trim().toUpperCase()) || code
}

export function collectYcCorridorTargets(
  channels: Awaited<ReturnType<typeof listYellowcardChannels>>,
): YcCorridorTarget[] {
  const map = new Map<string, YcCorridorTarget>()

  for (const ch of channels) {
    if (ch.apiStatus !== "active" || ch.status !== "active") continue
    const countryCode = String(ch.country ?? "").trim().toUpperCase()
    const currencyCode = String(ch.currency ?? "").trim().toUpperCase()
    if (!countryCode || !currencyCode || isExcludedPayoutCorridorCountry(countryCode)) continue

    const channelType = String(ch.channelType ?? "").toLowerCase()
    const rail: "bank_transfer" | "mobile_money" = channelType.includes("momo")
      ? "mobile_money"
      : "bank_transfer"
    const ramp = String(ch.rampType ?? "").toLowerCase()
    const ycSend = ramp.includes("withdraw") || ramp.includes("send")
    const ycReceive = ramp.includes("deposit") || ramp.includes("receive")
    if (!ycSend && !ycReceive) continue
    if (isExcludedPayoutCorridorTarget(countryCode, currencyCode, rail)) continue

    const key = corridorTargetKey({ countryCode, currencyCode, rail, ycSend, ycReceive })
    const existing = map.get(key)
    if (existing) {
      existing.ycSend = existing.ycSend || ycSend
      existing.ycReceive = existing.ycReceive || ycReceive
    } else {
      map.set(key, { countryCode, currencyCode, rail, ycSend, ycReceive })
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      a.countryCode.localeCompare(b.countryCode) ||
      a.currencyCode.localeCompare(b.currencyCode) ||
      a.rail.localeCompare(b.rail),
  )
}

function ycRouting() {
  return [{ provider: "yellowcard", priority: 1, settlement_asset: "USDC" }]
}

function mergeYcCapabilityMetadata(
  existing: unknown,
  target: YcCorridorTarget,
): Record<string, unknown> {
  const meta =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  if (target.ycSend) meta.yc_send = true
  if (target.ycReceive) meta.yc_receive = true
  return meta
}

export async function syncYcPayoutCorridors(admin: SupabaseClient): Promise<YcCorridorSyncResult> {
  const channels = await listYellowcardChannels()
  const targets = collectYcCorridorTargets(channels)
  if (targets.length === 0) {
    return { ok: true, inserted: 0, updated: 0, skipped: 0, targets: 0 }
  }

  const { data: existingRows, error } = await admin
    .from("payout_corridors")
    .select("id,country_code,currency_code,rail,metadata,provider_routing,country_name")

  if (error) {
    return { ok: false, inserted: 0, updated: 0, skipped: 0, targets: targets.length, error: error.message }
  }

  const existingByKey = new Map<string, (typeof existingRows)[number]>()
  for (const row of existingRows ?? []) {
    const k = `${String(row.country_code).toUpperCase()}:${String(row.currency_code).toUpperCase()}:${row.rail}`
    existingByKey.set(k, row)
  }

  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const target of targets) {
    const key = corridorTargetKey(target)
    const existing = existingByKey.get(key)
    const currencyName = currencyDisplayName(target.currencyCode)
    const countryName = existing?.country_name?.trim() || countryDisplayNameFromCode(target.countryCode)
    const metadata = mergeYcCapabilityMetadata(existing?.metadata, target)

    if (!existing) {
      const result = await upsertPayoutCorridor(admin, {
        rail: target.rail,
        country_code: target.countryCode,
        country_name: countryName,
        currency_code: target.currencyCode,
        currency_name: currencyName,
        enabled: false,
        provider_routing: ycRouting(),
        metadata,
      })
      if (result.ok) inserted++
      else skipped++
      continue
    }

    const priorMeta = (existing.metadata ?? {}) as Record<string, unknown>
    const metadataChanged =
      (target.ycSend && priorMeta.yc_send !== true) ||
      (target.ycReceive && priorMeta.yc_receive !== true) ||
      !existing.country_name?.trim()

    if (!metadataChanged) {
      skipped++
      continue
    }

    const updates: Record<string, unknown> = {
      metadata,
      updated_at: new Date().toISOString(),
    }
    if (!existing.country_name?.trim()) updates.country_name = countryName

    const { error: upErr } = await admin.from("payout_corridors").update(updates).eq("id", existing.id)
    if (upErr) skipped++
    else updated++
  }

  return { ok: true, inserted, updated, skipped, targets: targets.length }
}

export async function syncYcPayoutCorridorsSafe(admin: SupabaseClient): Promise<YcCorridorSyncResult> {
  try {
    return await syncYcPayoutCorridors(admin)
  } catch (e) {
    return {
      ok: false,
      inserted: 0,
      updated: 0,
      skipped: 0,
      targets: 0,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

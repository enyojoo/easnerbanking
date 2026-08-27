import type { SupabaseClient } from "@supabase/supabase-js"
import {
  currencyDisplayName,
  countryDisplayName,
  getCountryCodeForCurrency,
  listGridMomoOnlyCorridorPairs,
  listGridStaticBankCorridorPairs,
  localPaymentCurrencyForCountry,
} from "@easner/shared"
import {
  gridDiscoverySupportsCorridor,
  listGridDiscoveries,
} from "@/lib/grid/discoveries"
import type { GridDiscovery } from "@/lib/grid/types"
import { realignGridMomoCorridorRouting } from "@/lib/fx/grid-momo-corridor-routing"
import {
  disableOrphanPayoutCorridors,
  syncCorridorLiveFlagsWithEnabled,
} from "@/lib/fx/orphan-payout-corridor-cleanup"
import { isExcludedPayoutCorridorCountry, isExcludedPayoutCorridorTarget } from "@/lib/payout-corridors-exclusions"
import {
  gridCapabilityMetadataChanged,
  mergeGridCapabilityMetadataForSync,
} from "@/lib/fx/corridor-office-ops-guard"
import { upsertPayoutCorridor } from "@/lib/payout-corridors-upsert"

const BRIDGE_CURRENCIES = new Set(["USD", "USDC", "USDT"])

/** USD is a settlement bridge except where it is the local payout currency (US, SV, EC, …). */
function skipBridgeCurrency(currencyCode: string, countryCode: string): boolean {
  if (!BRIDGE_CURRENCIES.has(currencyCode)) return false
  if (currencyCode === "USD" && countryCode) return false
  return true
}

export type GridCorridorTarget = {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
}

export type GridCorridorSyncResult = {
  ok: boolean
  inserted: number
  updated: number
  skipped: number
  pruned: number
  targets: number
  realigned?: number
  flagsCleared?: number
  error?: string
}

function corridorTargetKey(t: GridCorridorTarget): string {
  return `${t.countryCode}:${t.currencyCode}:${t.rail}`
}

function countryDisplayNameFromCode(code: string): string {
  return countryDisplayName(code.trim().toUpperCase()) || code
}

function preferLocalCurrencyTargets(targets: GridCorridorTarget[]): GridCorridorTarget[] {
  const byCountryRail = new Map<string, GridCorridorTarget[]>()
  for (const target of targets) {
    const groupKey = `${target.countryCode}:${target.rail}`
    const list = byCountryRail.get(groupKey) ?? []
    list.push(target)
    byCountryRail.set(groupKey, list)
  }

  const out: GridCorridorTarget[] = []
  for (const list of byCountryRail.values()) {
    const localCurrency = localPaymentCurrencyForCountry(list[0]?.countryCode)
    if (localCurrency) {
      const pick = list.find((t) => t.currencyCode === localCurrency)
      if (pick) {
        out.push(pick)
        continue
      }
    }
    out.push(...list)
  }
  return out
}

function resolveCountryForDiscovery(d: GridDiscovery, currencyCode: string): string | null {
  const fromDiscovery = String(d.country ?? "").trim().toUpperCase()
  if (fromDiscovery && !isExcludedPayoutCorridorCountry(fromDiscovery)) return fromDiscovery
  const mapped = getCountryCodeForCurrency(currencyCode)
  if (!mapped || isExcludedPayoutCorridorCountry(mapped)) return null
  return mapped.toUpperCase()
}

/** Build unique Grid corridor targets from discoveries (rail-specific capability required). */
export function collectGridCorridorTargets(input: {
  discoveries: GridDiscovery[]
  exchangeRates?: Array<{ from: string; to: string; country?: string }>
}): GridCorridorTarget[] {
  const byPair = new Map<string, GridDiscovery[]>()

  for (const d of input.discoveries) {
    const currencyCode = String(d.currency ?? "").trim().toUpperCase()
    const countryCode = resolveCountryForDiscovery(d, currencyCode)
    if (!currencyCode || !countryCode) continue
    if (skipBridgeCurrency(currencyCode, countryCode)) continue
    const key = `${countryCode}:${currencyCode}`
    const list = byPair.get(key) ?? []
    list.push(d)
    byPair.set(key, list)
  }

  const targets = new Map<string, GridCorridorTarget>()

  for (const [pairKey, discoveries] of byPair) {
    const [countryCode, currencyCode] = pairKey.split(":")
    for (const rail of ["bank_transfer", "mobile_money"] as const) {
      if (
        gridDiscoverySupportsCorridor({
          discoveries,
          countryCode,
          currencyCode,
          rail,
        }) &&
        !isExcludedPayoutCorridorTarget(countryCode, currencyCode, rail)
      ) {
        const target = { countryCode, currencyCode, rail }
        targets.set(corridorTargetKey(target), target)
      }
    }
  }

  for (const pair of listGridMomoOnlyCorridorPairs()) {
    if (isExcludedPayoutCorridorTarget(pair.countryCode, pair.currencyCode, "mobile_money")) continue
    const momoTarget: GridCorridorTarget = {
      countryCode: pair.countryCode,
      currencyCode: pair.currencyCode,
      rail: "mobile_money",
    }
    targets.set(corridorTargetKey(momoTarget), momoTarget)
    targets.delete(`${pair.countryCode}:${pair.currencyCode}:bank_transfer`)
  }

  for (const pair of listGridStaticBankCorridorPairs()) {
    if (isExcludedPayoutCorridorTarget(pair.countryCode, pair.currencyCode, "bank_transfer")) continue
    const bankTarget: GridCorridorTarget = {
      countryCode: pair.countryCode,
      currencyCode: pair.currencyCode,
      rail: "bank_transfer",
    }
    targets.set(corridorTargetKey(bankTarget), bankTarget)
  }

  return preferLocalCurrencyTargets(
    [...targets.values()].sort(
      (a, b) =>
        a.countryCode.localeCompare(b.countryCode) ||
        a.currencyCode.localeCompare(b.currencyCode) ||
        a.rail.localeCompare(b.rail),
    ),
  )
}

function gridOnlyRouting() {
  return [{ provider: "grid", priority: 1, settlement_asset: "USDC" }]
}

/** Insert missing payout_corridors rows for Grid discoveries/rates and mark Grid capability on existing rows. */
export async function syncGridPayoutCorridors(
  admin: SupabaseClient,
  opts?: { forceRefresh?: boolean },
): Promise<GridCorridorSyncResult> {
  const discoveries = await listGridDiscoveries(opts?.forceRefresh ?? true)
  const targets = collectGridCorridorTargets({ discoveries })
  if (targets.length === 0) {
    return { ok: true, inserted: 0, updated: 0, skipped: 0, pruned: 0, targets: 0 }
  }

  const { data: existingRows, error } = await admin
    .from("payout_corridors")
    .select("id,country_code,currency_code,rail,metadata,provider_routing,country_name")

  if (error) {
    return { ok: false, inserted: 0, updated: 0, skipped: 0, pruned: 0, targets: targets.length, error: error.message }
  }

  const existingByKey = new Map<string, (typeof existingRows)[number]>()
  for (const row of existingRows ?? []) {
    const key = `${String(row.country_code).toUpperCase()}:${String(row.currency_code).toUpperCase()}:${row.rail}`
    existingByKey.set(key, row)
  }

  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const target of targets) {
    if (isExcludedPayoutCorridorTarget(target.countryCode, target.currencyCode, target.rail)) {
      skipped++
      continue
    }

    const key = corridorTargetKey(target)
    const existing = existingByKey.get(key)
    const currencyName = currencyDisplayName(target.currencyCode)
    const countryName =
      existing?.country_name?.trim() ||
      countryDisplayNameFromCode(target.countryCode)

    if (!existing) {
      const result = await upsertPayoutCorridor(admin, {
        rail: target.rail,
        country_code: target.countryCode,
        country_name: countryName,
        currency_code: target.currencyCode,
        currency_name: currencyName,
        enabled: false,
        provider_routing: gridOnlyRouting(),
        metadata: mergeGridCapabilityMetadataForSync(null),
      })
      if (result.ok) inserted++
      else skipped++
      continue
    }

    const metadata = mergeGridCapabilityMetadataForSync(existing.metadata)
    const priorMeta = (existing.metadata ?? {}) as Record<string, unknown>
    const metadataChanged =
      gridCapabilityMetadataChanged(priorMeta, metadata) || !existing.country_name?.trim()

    if (!metadataChanged) {
      skipped++
      continue
    }

    const updates: Record<string, unknown> = {
      metadata,
      updated_at: new Date().toISOString(),
    }
    if (!existing.country_name?.trim()) {
      updates.country_name = countryName
    }

    const { error: upErr } = await admin
      .from("payout_corridors")
      .update(updates)
      .eq("id", existing.id)
    if (upErr) skipped++
    else updated++
  }

  const realign = await realignGridMomoCorridorRouting(admin)
  if (!realign.ok) {
    return {
      ok: false,
      inserted,
      updated,
      skipped,
      pruned: 0,
      targets: targets.length,
      error: realign.error,
    }
  }

  const orphanCleanup = await disableOrphanPayoutCorridors(admin)
  if (!orphanCleanup.ok) {
    return {
      ok: false,
      inserted,
      updated,
      skipped,
      pruned: 0,
      targets: targets.length,
      realigned: realign.realigned,
      error: orphanCleanup.error,
    }
  }

  const flags = await syncCorridorLiveFlagsWithEnabled(admin)
  if (!flags.ok) {
    return {
      ok: false,
      inserted,
      updated,
      skipped,
      pruned: orphanCleanup.disabled,
      targets: targets.length,
      realigned: realign.realigned,
      flagsCleared: flags.cleared,
      error: flags.error,
    }
  }

  return {
    ok: true,
    inserted,
    updated,
    skipped,
    pruned: orphanCleanup.disabled,
    targets: targets.length,
    realigned: realign.realigned,
    flagsCleared: flags.cleared,
  }
}

export async function syncGridPayoutCorridorsSafe(
  admin: SupabaseClient,
  opts?: { forceRefresh?: boolean },
): Promise<GridCorridorSyncResult> {
  try {
    return await syncGridPayoutCorridors(admin, opts)
  } catch (e) {
    return {
      ok: false,
      inserted: 0,
      updated: 0,
      skipped: 0,
      pruned: 0,
      targets: 0,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

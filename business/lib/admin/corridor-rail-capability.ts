import {
  corridorTargetKey,
  isExcludedPayoutCorridorTarget,
} from "@/lib/payout-corridors-exclusions"

type CorridorRow = {
  country_code: string
  currency_code: string
  rail: string
  noah_sell_available?: boolean
  yc_send_available?: boolean
  yc_receive_available?: boolean
  grid_send_available?: boolean
  grid_receive_available?: boolean
  provider_routing?: unknown
  metadata?: unknown
}

function parseRouting(raw: unknown): Array<{ provider: string }> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const provider = String((item as Record<string, unknown>).provider ?? "").trim()
      return provider ? { provider } : null
    })
    .filter(Boolean) as Array<{ provider: string }>
}

function rowMetadata(row: { metadata?: unknown }): Record<string, unknown> {
  return row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? (row.metadata as Record<string, unknown>)
    : {}
}

function hasSyncedMetadataCapability(meta: Record<string, unknown>): boolean {
  return (
    meta.yc_send === true ||
    meta.yc_receive === true ||
    meta.grid_send === true ||
    meta.grid_receive === true ||
    meta.noah_receive === true
  )
}

/** True when a corridor row should appear on the fiat admin tab for its rail. */
export function corridorHasRailCapability(row: CorridorRow): boolean {
  if (
    isExcludedPayoutCorridorTarget(row.country_code, row.currency_code, row.rail)
  ) {
    return false
  }

  if (
    row.noah_sell_available === true ||
    row.yc_send_available === true ||
    row.yc_receive_available === true ||
    row.grid_send_available === true ||
    row.grid_receive_available === true
  ) {
    return true
  }

  const routing = parseRouting(row.provider_routing)
  if (routing.length === 0) return false

  return hasSyncedMetadataCapability(rowMetadata(row))
}

/** Rows safe to delete: product exclusions or empty shells with no live or configured capability. */
export function isZombiePayoutCorridor(row: CorridorRow): boolean {
  if (
    isExcludedPayoutCorridorTarget(row.country_code, row.currency_code, row.rail)
  ) {
    return true
  }

  if (corridorHasRailCapability(row)) return false

  const meta = rowMetadata(row)
  const routing = parseRouting(row.provider_routing)
  return !hasSyncedMetadataCapability(meta) && routing.length === 0
}

export function zombieCorridorKey(row: CorridorRow): string {
  return corridorTargetKey(row.country_code, row.currency_code, row.rail)
}

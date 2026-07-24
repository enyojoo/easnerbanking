"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { CountryFlag } from "@/components/flags"
import { payoutCorridorsApi, type PayoutCorridorAdminRow } from "@/lib/payout-corridors-api"
import {
  defaultCrossBorderProvider,
  parseCrossBorderProvider,
  type CrossBorderProviderId,
} from "@easner/shared"
import { officeKeys } from "@/lib/query/keys"
import { useOfficePayoutCorridors, useQueryInitialLoading } from "@/hooks/queries"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"

type ProviderId = "noah" | "yellowcard" | "grid"

type FiatDestinationRow = {
  key: string
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
  corridorIds: string[]
  payInCorridorIds: string[]
  enabled: boolean
  payoutProvider: ProviderId
  payInProvider: ProviderId | null
  payInSupported: boolean
  payInEnabled: boolean
  supportNoahPayout: boolean
  supportYcPayout: boolean
  supportGridPayout: boolean
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
  supportGridPayIn: boolean
  payoutLocked: ProviderId | null
  crossBorderSupported: boolean
  crossBorderProvider: CrossBorderProviderId | null
  crossBorderLocked: CrossBorderProviderId | null
  sample: PayoutCorridorAdminRow
}

type RoutingEntry = { provider: string; priority: number; settlement_asset: string }

function parseRouting(routing: unknown): RoutingEntry[] {
  if (!Array.isArray(routing)) return []
  return routing
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      provider: String((item as { provider?: string }).provider ?? "").toLowerCase(),
      priority: Number((item as { priority?: number }).priority ?? 99),
      settlement_asset: String((item as { settlement_asset?: string }).settlement_asset ?? "USDC"),
    }))
    .filter((item) => item.provider === "noah" || item.provider === "yellowcard" || item.provider === "grid")
}

function parsePrimaryProvider(routing: unknown): ProviderId {
  const sorted = [...parseRouting(routing)].sort((a, b) => a.priority - b.priority)
  const p = sorted[0]?.provider
  if (p === "yellowcard" || p === "grid") return p
  return "noah"
}

function parsePayInProviderFromRouting(
  routing: unknown,
  payoutProvider: ProviderId,
): ProviderId | null {
  const sorted = [...parseRouting(routing)].sort((a, b) => a.priority - b.priority)
  if (sorted.length >= 2) {
    const p = sorted[1].provider
    if (p === "yellowcard" || p === "grid" || p === "noah") return p
  }
  if (sorted.length === 1 && sorted[0].provider === payoutProvider) {
    return null
  }
  return null
}

function routingPrimaryProvider(routing: unknown): ProviderId | null {
  const sorted = [...parseRouting(routing)].sort((a, b) => a.priority - b.priority)
  const p = sorted[0]?.provider
  if (p === "yellowcard" || p === "noah" || p === "grid") return p
  return null
}

function rowMetadata(row: PayoutCorridorAdminRow): Record<string, unknown> {
  return (row.metadata ?? {}) as Record<string, unknown>
}

function rowSupportsYcPayout(row: PayoutCorridorAdminRow): boolean {
  const meta = rowMetadata(row)
  return (
    meta.yc_send === true ||
    row.yc_send_available === true ||
    routingPrimaryProvider(row.provider_routing) === "yellowcard"
  )
}

function rowSupportsYcPayIn(row: PayoutCorridorAdminRow): boolean {
  const meta = rowMetadata(row)
  return meta.yc_receive === true || row.yc_receive_available === true
}

function rowSupportsGridPayout(row: PayoutCorridorAdminRow): boolean {
  const meta = rowMetadata(row)
  return (
    meta.grid_send === true ||
    row.grid_send_available === true ||
    routingPrimaryProvider(row.provider_routing) === "grid"
  )
}

function rowSupportsGridPayIn(row: PayoutCorridorAdminRow): boolean {
  const meta = rowMetadata(row)
  return meta.grid_receive === true || row.grid_receive_available === true
}

function rowSupportsNoahPayout(row: PayoutCorridorAdminRow): boolean {
  return (
    row.noah_sell_available === true ||
    row.provider_health?.noah === "ok" ||
    String(row.settlement_backend ?? "").toLowerCase() === "noah" ||
    routingPrimaryProvider(row.provider_routing) === "noah"
  )
}

function rowSupportsNoahPayIn(row: PayoutCorridorAdminRow): boolean {
  return rowMetadata(row).noah_receive === true
}

function rowPayInEnabledForProvider(row: PayoutCorridorAdminRow, provider: ProviderId): boolean {
  const meta = rowMetadata(row)
  if (provider === "yellowcard" && rowSupportsYcPayIn(row)) return meta.yc_receive_enabled === true
  if (provider === "noah" && rowSupportsNoahPayIn(row)) return meta.noah_receive_enabled === true
  if (provider === "grid" && rowSupportsGridPayIn(row)) return meta.grid_receive_enabled === true
  return false
}

/** Apply Live toggle to corridor metadata: pay-in, pay-out, and cross-border flags. */
function applyCorridorLiveMetadata(input: {
  metadata: Record<string, unknown>
  corridor: PayoutCorridorAdminRow
  row: FiatDestinationRow
  enabled: boolean
}): Record<string, unknown> {
  const metadata = { ...input.metadata }
  const { corridor, row, enabled } = input

  if (row.payInProvider === "yellowcard" && rowSupportsYcPayIn(corridor)) {
    if (enabled) {
      metadata.yc_receive = true
      metadata.yc_receive_enabled = true
    } else {
      metadata.yc_receive_enabled = false
    }
  }
  if (row.payInProvider === "grid" && rowSupportsGridPayIn(corridor)) {
    if (enabled) {
      metadata.grid_receive = true
      metadata.grid_receive_enabled = true
    } else {
      metadata.grid_receive_enabled = false
    }
  }
  if (row.payInProvider === "noah" && rowSupportsNoahPayIn(corridor)) {
    metadata.noah_receive_enabled = enabled
    if (enabled) metadata.noah_receive = true
  }

  if (row.payoutProvider === "yellowcard" && rowSupportsYcPayout(corridor)) {
    if (enabled) {
      metadata.yc_send = true
      metadata.yc_send_enabled = true
    } else {
      metadata.yc_send_enabled = false
    }
  }
  if (row.payoutProvider === "grid" && rowSupportsGridPayout(corridor)) {
    if (enabled) {
      metadata.grid_send = true
      metadata.grid_send_enabled = true
    } else {
      metadata.grid_send_enabled = false
    }
  }
  if (row.payoutProvider === "noah" && rowSupportsNoahPayout(corridor)) {
    metadata.noah_send_enabled = enabled
  }

  if (row.crossBorderSupported && row.crossBorderProvider) {
    if (enabled) {
      metadata.cross_border_enabled = true
      metadata.cross_border_provider = row.crossBorderProvider
      if (row.crossBorderProvider === "yellowcard" && rowSupportsYcPayout(corridor)) {
        metadata.yc_send = true
        metadata.yc_send_enabled = true
      }
      if (row.crossBorderProvider === "grid" && rowSupportsGridPayout(corridor)) {
        metadata.grid_send = true
        metadata.grid_send_enabled = true
      }
    } else {
      metadata.cross_border_enabled = false
    }
  }

  return metadata
}

function providerLabel(provider: ProviderId): string {
  if (provider === "yellowcard") return "Yellowcard"
  if (provider === "grid") return "Grid"
  return "Noah"
}

function crossBorderProviderLabel(provider: CrossBorderProviderId): string {
  return provider === "grid" ? "Grid" : "Yellowcard"
}

function resolveCrossBorderProviderForRow(
  caps: { supportYcPayout: boolean; supportGridPayout: boolean },
  metadata: unknown,
): CrossBorderProviderId | null {
  return (
    parseCrossBorderProvider(metadata) ??
    defaultCrossBorderProvider({
      supportYellowcard: caps.supportYcPayout,
      supportGrid: caps.supportGridPayout,
    })
  )
}

function resolvePayInProvider(input: {
  payoutProvider: ProviderId
  payoutLocked: ProviderId | null
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
  supportGridPayIn: boolean
}): ProviderId | null {
  if (input.payoutLocked === "noah") {
    if (input.supportGridPayIn) return "grid"
    if (input.supportYcPayIn) return "yellowcard"
    if (input.supportNoahPayIn) return "noah"
    return null
  }
  if (input.payoutLocked === "yellowcard") {
    if (input.supportYcPayIn) return "yellowcard"
    if (input.supportGridPayIn) return "grid"
    if (input.supportNoahPayIn) return "noah"
    return null
  }
  if (input.payoutLocked === "grid") {
    if (input.supportGridPayIn) return "grid"
    if (input.supportYcPayIn) return "yellowcard"
    if (input.supportNoahPayIn) return "noah"
    return null
  }

  const providers: ProviderId[] = ["noah", "yellowcard", "grid"].filter(
    (p) => p !== input.payoutProvider,
  ) as ProviderId[]
  for (const p of providers) {
    if (p === "grid" && input.supportGridPayIn) return "grid"
    if (p === "yellowcard" && input.supportYcPayIn) return "yellowcard"
    if (p === "noah" && input.supportNoahPayIn) return "noah"
  }
  if (input.payoutProvider === "grid" && input.supportGridPayIn) return "grid"
  if (input.payoutProvider === "yellowcard" && input.supportYcPayIn) return "yellowcard"
  if (input.payoutProvider === "noah" && input.supportNoahPayIn) return "noah"
  return null
}

function buildProviderRouting(
  payoutProvider: ProviderId,
  input: {
    payoutLocked: ProviderId | null
    supportNoahPayout: boolean
    supportYcPayout: boolean
    supportGridPayout: boolean
    supportYcPayIn: boolean
    supportNoahPayIn: boolean
    supportGridPayIn: boolean
    payInProvider?: ProviderId | null
  },
): RoutingEntry[] {
  const explicitPayIn = input.payInProvider ?? null
  const payoutProviders = [
    input.supportNoahPayout ? "noah" : null,
    input.supportYcPayout ? "yellowcard" : null,
    input.supportGridPayout ? "grid" : null,
  ].filter(Boolean) as ProviderId[]
  const dualPayout = !input.payoutLocked && payoutProviders.length > 1

  if (input.payoutLocked) {
    const routing: RoutingEntry[] = [
      { provider: input.payoutLocked, priority: 1, settlement_asset: "USDC" },
    ]
    const payInProvider =
      explicitPayIn ??
      resolvePayInProvider({
        payoutProvider: input.payoutLocked,
        payoutLocked: input.payoutLocked,
        supportYcPayIn: input.supportYcPayIn,
        supportNoahPayIn: input.supportNoahPayIn,
        supportGridPayIn: input.supportGridPayIn,
      })
    if (payInProvider && payInProvider !== input.payoutLocked) {
      routing.push({ provider: payInProvider, priority: 2, settlement_asset: "USDC" })
    }
    return routing
  }

  const routing: RoutingEntry[] = [
    { provider: payoutProvider, priority: 1, settlement_asset: "USDC" },
  ]

  if (dualPayout) {
    for (const p of payoutProviders) {
      if (p !== payoutProvider) {
        routing.push({ provider: p, priority: routing.length + 1, settlement_asset: "USDC" })
      }
    }
    return routing
  }

  const payInProvider =
    explicitPayIn ??
    resolvePayInProvider({
      payoutProvider,
      payoutLocked: null,
      supportYcPayIn: input.supportYcPayIn,
      supportNoahPayIn: input.supportNoahPayIn,
      supportGridPayIn: input.supportGridPayIn,
    })
  if (payInProvider && payInProvider !== payoutProvider) {
    routing.push({ provider: payInProvider, priority: 2, settlement_asset: "USDC" })
  }

  return routing
}

function payInProviderOptions(caps: {
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
  supportGridPayIn: boolean
}): ProviderId[] {
  return (
    [
      caps.supportGridPayIn ? "grid" : null,
      caps.supportYcPayIn ? "yellowcard" : null,
      caps.supportNoahPayIn ? "noah" : null,
    ] as Array<ProviderId | null>
  ).filter(Boolean) as ProviderId[]
}

type CountryCurrencyCaps = {
  supportNoahPayout: boolean
  supportYcPayout: boolean
  supportGridPayout: boolean
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
  supportGridPayIn: boolean
}

function corridorHasAnyCapability(row: PayoutCorridorAdminRow): boolean {
  return (
    rowSupportsNoahPayout(row) ||
    rowSupportsYcPayout(row) ||
    rowSupportsGridPayout(row) ||
    rowSupportsYcPayIn(row) ||
    rowSupportsNoahPayIn(row) ||
    rowSupportsGridPayIn(row)
  )
}

function rowCaps(row: PayoutCorridorAdminRow): CountryCurrencyCaps {
  return {
    supportNoahPayout: rowSupportsNoahPayout(row),
    supportYcPayout: rowSupportsYcPayout(row),
    supportGridPayout: rowSupportsGridPayout(row),
    supportYcPayIn: rowSupportsYcPayIn(row),
    supportNoahPayIn: rowSupportsNoahPayIn(row),
    supportGridPayIn: rowSupportsGridPayIn(row),
  }
}

function mergeCaps(a: CountryCurrencyCaps, b: CountryCurrencyCaps): CountryCurrencyCaps {
  return {
    supportNoahPayout: a.supportNoahPayout || b.supportNoahPayout,
    supportYcPayout: a.supportYcPayout || b.supportYcPayout,
    supportGridPayout: a.supportGridPayout || b.supportGridPayout,
    supportYcPayIn: a.supportYcPayIn || b.supportYcPayIn,
    supportNoahPayIn: a.supportNoahPayIn || b.supportNoahPayIn,
    supportGridPayIn: a.supportGridPayIn || b.supportGridPayIn,
  }
}

function payInCorridorIdsForProvider(
  railRows: PayoutCorridorAdminRow[],
  provider: ProviderId,
): string[] {
  return railRows
    .filter((r) => {
      if (provider === "yellowcard") return rowSupportsYcPayIn(r)
      if (provider === "grid") return rowSupportsGridPayIn(r)
      return rowSupportsNoahPayIn(r)
    })
    .map((r) => r.id)
}

function groupFiatDestinations(filteredRows: PayoutCorridorAdminRow[]): FiatDestinationRow[] {
  const map = new Map<string, FiatDestinationRow>()

  for (const r of filteredRows) {
    if (!corridorHasAnyCapability(r)) continue

    const key = `${r.country_code}:${r.currency_code}`
    const existing = map.get(key)
    const caps = existing
      ? mergeCaps(
          {
            supportNoahPayout: existing.supportNoahPayout,
            supportYcPayout: existing.supportYcPayout,
            supportGridPayout: existing.supportGridPayout,
            supportYcPayIn: existing.supportYcPayIn,
            supportNoahPayIn: existing.supportNoahPayIn,
            supportGridPayIn: existing.supportGridPayIn,
          },
          rowCaps(r),
        )
      : rowCaps(r)

    const supportNoahPayout = caps.supportNoahPayout
    const supportYcPayout = caps.supportYcPayout
    const supportGridPayout = caps.supportGridPayout
    const supportYcPayIn = caps.supportYcPayIn
    const supportNoahPayIn = caps.supportNoahPayIn
    const supportGridPayIn = caps.supportGridPayIn
    const payoutLocked: ProviderId | null =
      [supportNoahPayout, supportYcPayout, supportGridPayout].filter(Boolean).length === 1
        ? supportNoahPayout
          ? "noah"
          : supportYcPayout
            ? "yellowcard"
            : "grid"
        : null
    const payoutProvider = parsePrimaryProvider(r.provider_routing)
    const payInFromRouting = parsePayInProviderFromRouting(r.provider_routing, payoutProvider)
    const payInProvider =
      payInFromRouting ??
      resolvePayInProvider({
        payoutProvider,
        payoutLocked,
        supportYcPayIn,
        supportNoahPayIn,
        supportGridPayIn,
      })
    const payInSupported = payInProvider !== null
    const railRows = filteredRows.filter(
      (row) => row.country_code === r.country_code && row.currency_code === r.currency_code,
    )
    const payInEnabled =
      payInProvider !== null
        ? railRows.some((row) => rowPayInEnabledForProvider(row, payInProvider))
        : false
    const crossBorderSupported = supportYcPayout || supportGridPayout
    const crossBorderProvider = crossBorderSupported
      ? resolveCrossBorderProviderForRow(
          { supportYcPayout, supportGridPayout },
          rowMetadata(r),
        )
      : null
    const crossBorderLocked: CrossBorderProviderId | null =
      crossBorderSupported &&
      [supportYcPayout, supportGridPayout].filter(Boolean).length === 1
        ? supportYcPayout
          ? "yellowcard"
          : "grid"
        : null

    if (!existing) {
      map.set(key, {
        key,
        country_code: r.country_code,
        country_name: r.country_name,
        currency_code: r.currency_code,
        currency_name: r.currency_name,
        corridorIds: [r.id],
        payInCorridorIds:
          payInProvider !== null ? payInCorridorIdsForProvider(railRows, payInProvider) : [],
        enabled: r.enabled,
        payoutProvider,
        payInProvider,
        payInSupported,
        payInEnabled,
        supportNoahPayout,
        supportYcPayout,
        supportGridPayout,
        supportYcPayIn,
        supportNoahPayIn,
        supportGridPayIn,
        payoutLocked,
        crossBorderSupported,
        crossBorderProvider,
        crossBorderLocked,
        sample: r,
      })
      continue
    }

    existing.corridorIds.push(r.id)
    existing.enabled = existing.enabled && r.enabled
    existing.supportNoahPayout = supportNoahPayout
    existing.supportYcPayout = supportYcPayout
    existing.supportGridPayout = supportGridPayout
    existing.supportYcPayIn = supportYcPayIn
    existing.supportNoahPayIn = supportNoahPayIn
    existing.supportGridPayIn = supportGridPayIn
    existing.payInProvider = payInProvider
    existing.payInSupported = payInSupported
    existing.payInEnabled = payInEnabled || existing.payInEnabled
    existing.payoutLocked = payoutLocked
    existing.payInCorridorIds =
      payInProvider !== null ? payInCorridorIdsForProvider(railRows, payInProvider) : []
    existing.crossBorderSupported = supportYcPayout || supportGridPayout
    existing.crossBorderProvider = existing.crossBorderSupported
      ? resolveCrossBorderProviderForRow(
          { supportYcPayout, supportGridPayout },
          rowMetadata(existing.sample),
        )
      : null
    existing.crossBorderLocked =
      existing.crossBorderSupported &&
      [supportYcPayout, supportGridPayout].filter(Boolean).length === 1
        ? supportYcPayout
          ? "yellowcard"
          : "grid"
        : null
  }

  return [...map.values()].sort(
    (a, b) => a.country_name.localeCompare(b.country_name) || a.currency_code.localeCompare(b.currency_code),
  )
}

export function PayoutCorridorsAdminPanel() {
  const queryClient = useQueryClient()
  const corridorsQuery = useOfficePayoutCorridors()
  const rows = corridorsQuery.data ?? []
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [railTab, setRailTab] = useState<"bank_transfer" | "mobile_money">("bank_transfer")
  const filteredRows = useMemo(
    () => rows.filter((r) => r.rail === railTab || (!r.rail && railTab === "bank_transfer")),
    [rows, railTab],
  )
  const fiatRows = useMemo(() => groupFiatDestinations(filteredRows), [filteredRows])
  const showTableSkeleton = useQueryInitialLoading(corridorsQuery.isPending, corridorsQuery.data, fiatRows)
  const refreshing = corridorsQuery.isFetching && !showTableSkeleton

  const toggleEnabled = async (row: FiatDestinationRow, enabled: boolean) => {
    setSavingKey(row.key)
    try {
      const updates = await Promise.all(
        row.corridorIds.map((id) => {
          const existing = rows.find((r) => r.id === id) ?? row.sample
          const metadata = applyCorridorLiveMetadata({
            metadata: rowMetadata(existing),
            corridor: existing,
            row,
            enabled,
          })
          return payoutCorridorsApi.patch(id, { enabled, metadata })
        }),
      )
      queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) => {
        const list = prev ?? []
        const byId = new Map(updates.map((u) => [u.id, u]))
        return list.map((r) => byId.get(r.id) ?? r)
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingKey(null)
    }
  }

  const setPayoutProvider = async (row: FiatDestinationRow, provider: ProviderId) => {
    setSavingKey(row.key)
    try {
      const routing = buildProviderRouting(provider, {
        payoutLocked: row.payoutLocked,
        supportNoahPayout: row.supportNoahPayout,
        supportYcPayout: row.supportYcPayout,
        supportGridPayout: row.supportGridPayout,
        supportYcPayIn: row.supportYcPayIn,
        supportNoahPayIn: row.supportNoahPayIn,
        supportGridPayIn: row.supportGridPayIn,
        payInProvider: row.payInProvider,
      })
      const updates = await Promise.all(
        row.corridorIds.map((id) => payoutCorridorsApi.patch(id, { provider_routing: routing })),
      )
      queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) => {
        const list = prev ?? []
        const byId = new Map(updates.map((u) => [u.id, u]))
        return list.map((r) => byId.get(r.id) ?? r)
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingKey(null)
    }
  }

  const setPayInProviderChoice = async (row: FiatDestinationRow, provider: ProviderId) => {
    setSavingKey(row.key)
    try {
      const routing = buildProviderRouting(row.payoutProvider, {
        payoutLocked: row.payoutLocked,
        supportNoahPayout: row.supportNoahPayout,
        supportYcPayout: row.supportYcPayout,
        supportGridPayout: row.supportGridPayout,
        supportYcPayIn: row.supportYcPayIn,
        supportNoahPayIn: row.supportNoahPayIn,
        supportGridPayIn: row.supportGridPayIn,
        payInProvider: provider,
      })
      const routingUpdates = await Promise.all(
        row.corridorIds.map((id) => payoutCorridorsApi.patch(id, { provider_routing: routing })),
      )
      const payInCorridorIds = payInCorridorIdsForProvider(
        filteredRows.filter(
          (c) => c.country_code === row.country_code && c.currency_code === row.currency_code,
        ),
        provider,
      )
      const targetIds = payInCorridorIds.length > 0 ? payInCorridorIds : row.corridorIds
      const metaUpdates = await Promise.all(
        targetIds.map((id) => {
          const existing = rows.find((r) => r.id === id)
          const meta = { ...rowMetadata(existing ?? row.sample) }
          const metadata = { ...meta }
          if (provider === "yellowcard" && rowSupportsYcPayIn(existing ?? row.sample)) {
            metadata.yc_receive_enabled = true
            metadata.yc_receive = true
          }
          if (provider === "noah" && rowSupportsNoahPayIn(existing ?? row.sample)) {
            metadata.noah_receive_enabled = true
          }
          if (provider === "grid" && rowSupportsGridPayIn(existing ?? row.sample)) {
            metadata.grid_receive_enabled = true
            metadata.grid_receive = true
          }
          return payoutCorridorsApi.patch(id, { metadata })
        }),
      )
      const updates = [...routingUpdates, ...metaUpdates]
      queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) => {
        const list = prev ?? []
        const byId = new Map(updates.map((u) => [u.id, u]))
        return list.map((r) => byId.get(r.id) ?? r)
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingKey(null)
    }
  }

  const setCrossBorderProvider = async (
    row: FiatDestinationRow,
    provider: CrossBorderProviderId,
  ) => {
    setSavingKey(row.key)
    try {
      const updates = await Promise.all(
        row.corridorIds.map((id) => {
          const existing = rows.find((r) => r.id === id)
          const meta = { ...rowMetadata(existing ?? row.sample) }
          return payoutCorridorsApi.patch(id, {
            metadata: { ...meta, cross_border_provider: provider },
          })
        }),
      )
      queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) => {
        const list = prev ?? []
        const byId = new Map(updates.map((u) => [u.id, u]))
        return list.map((r) => byId.get(r.id) ?? r)
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <PlatformControlTabShell
      title="Fiat corridors"
      maxWidth="max-w-none"
      actions={
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button
              type="button"
              className={`px-3 py-1.5 ${railTab === "bank_transfer" ? "bg-muted font-medium" : ""}`}
              onClick={() => setRailTab("bank_transfer")}
            >
              Bank
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 ${railTab === "mobile_money" ? "bg-muted font-medium" : ""}`}
              onClick={() => setRailTab("mobile_money")}
            >
              Mobile money
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void corridorsQuery.refetch()}
            disabled={corridorsQuery.isFetching}
          >
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
        </div>
      }
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {corridorsQuery.error ? (
        <p className="text-sm text-destructive">
          {corridorsQuery.error instanceof Error
            ? corridorsQuery.error.message
            : "Failed to load fiat corridors"}
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {showTableSkeleton ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : fiatRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No fiat corridors yet. Run corridor seed + provider sync scripts, then Refresh.
            </p>
          ) : (
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[240px]">Country</TableHead>
                  <TableHead className="w-[140px]">Providers</TableHead>
                  <TableHead className="w-[160px]">Payout</TableHead>
                  <TableHead className="w-[160px]">Pay-in</TableHead>
                  <TableHead className="w-[160px]">Cross-border</TableHead>
                  <TableHead className="w-[100px] text-right">Live</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fiatRows.map((r) => {
                  const showNoah = r.supportNoahPayout
                  const showYc = r.supportYcPayout || r.supportYcPayIn
                  const showGrid = r.supportGridPayout || r.supportGridPayIn
                  const payoutOptions = [
                    r.supportNoahPayout ? "noah" : null,
                    r.supportYcPayout ? "yellowcard" : null,
                    r.supportGridPayout ? "grid" : null,
                  ].filter(Boolean) as ProviderId[]
                  const canChoosePayout = !r.payoutLocked && payoutOptions.length > 1
                  const canChooseCrossBorder =
                    r.crossBorderSupported &&
                    !r.crossBorderLocked &&
                    r.supportYcPayout &&
                    r.supportGridPayout

                  const payInOptions = payInProviderOptions({
                    supportYcPayIn: r.supportYcPayIn,
                    supportNoahPayIn: r.supportNoahPayIn,
                    supportGridPayIn: r.supportGridPayIn,
                  })
                  const canChoosePayIn = payInOptions.length > 1

                  return (
                    <TableRow key={r.key}>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <CountryFlag code={r.country_code} size={20} />
                          <span className="truncate font-medium">{r.country_name}</span>
                          <span className="text-muted-foreground text-xs shrink-0">{r.currency_code}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {showNoah ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">Noah</span>
                          ) : null}
                          {showYc ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">YC</span>
                          ) : null}
                          {showGrid ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">Grid</span>
                          ) : null}
                          {!showNoah && !showYc && !showGrid ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {canChoosePayout ? (
                          <select
                            className="h-8 w-full max-w-[148px] rounded-md border bg-background px-2 text-xs"
                            value={r.payoutProvider}
                            disabled={savingKey === r.key}
                            aria-label="Payout"
                            onChange={(e) =>
                              void setPayoutProvider(
                                r,
                                e.target.value === "yellowcard"
                                  ? "yellowcard"
                                  : e.target.value === "grid"
                                    ? "grid"
                                    : "noah",
                              )
                            }
                          >
                            {r.supportNoahPayout ? <option value="noah">Noah</option> : null}
                            {r.supportYcPayout ? <option value="yellowcard">Yellowcard</option> : null}
                            {r.supportGridPayout ? <option value="grid">Grid</option> : null}
                          </select>
                        ) : r.payoutLocked ? (
                          <span className="text-xs font-medium">{providerLabel(r.payoutLocked)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!r.payInSupported || !r.payInProvider || payInOptions.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : canChoosePayIn ? (
                          <select
                            className="h-8 w-full max-w-[148px] rounded-md border bg-background px-2 text-xs"
                            value={r.payInProvider}
                            disabled={savingKey === r.key}
                            aria-label="Pay-in provider"
                            onChange={(e) =>
                              void setPayInProviderChoice(
                                r,
                                e.target.value === "yellowcard"
                                  ? "yellowcard"
                                  : e.target.value === "grid"
                                    ? "grid"
                                    : "noah",
                              )
                            }
                          >
                            {r.supportGridPayIn ? <option value="grid">Grid</option> : null}
                            {r.supportYcPayIn ? (
                              <option value="yellowcard">Yellowcard</option>
                            ) : null}
                            {r.supportNoahPayIn ? <option value="noah">Noah</option> : null}
                          </select>
                        ) : (
                          <span className="text-xs font-medium">{providerLabel(r.payInProvider)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!r.crossBorderSupported || !r.crossBorderProvider ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : canChooseCrossBorder ? (
                          <select
                            className="h-8 w-full max-w-[148px] rounded-md border bg-background px-2 text-xs"
                            value={r.crossBorderProvider}
                            disabled={savingKey === r.key}
                            aria-label="Cross-border"
                            onChange={(e) =>
                              void setCrossBorderProvider(
                                r,
                                e.target.value === "grid" ? "grid" : "yellowcard",
                              )
                            }
                          >
                            {r.supportYcPayout ? (
                              <option value="yellowcard">Yellowcard</option>
                            ) : null}
                            {r.supportGridPayout ? <option value="grid">Grid</option> : null}
                          </select>
                        ) : (
                          <span className="text-xs font-medium">
                            {crossBorderProviderLabel(r.crossBorderProvider)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <Switch
                            checked={r.enabled}
                            disabled={savingKey === r.key}
                            onCheckedChange={(v) => void toggleEnabled(r, v)}
                          />
                          {savingKey === r.key ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PlatformControlTabShell>
  )
}

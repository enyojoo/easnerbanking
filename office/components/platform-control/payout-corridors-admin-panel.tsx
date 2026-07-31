"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { CountryFlag } from "@/components/flags"
import { payoutCorridorsApi, type PayoutCorridorAdminRow } from "@/lib/payout-corridors-api"
import { parseCrossBorderProvider, type CrossBorderProviderId } from "@easner/shared"
import { officeKeys } from "@/lib/query/keys"
import { useOfficePayoutCorridors, useQueryInitialLoading } from "@/hooks/queries"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { ProcessingFeePricingDialog } from "@/components/platform-control/processing-fee-pricing-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"

type ProviderId = "noah" | "yellowcard" | "grid"
type FeatureSelection<T extends string> = T | "disabled"

type FiatDestinationRow = {
  key: string
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
  corridorIds: string[]
  payInCorridorIds: string[]
  enabled: boolean
  payoutProvider: ProviderId | null
  payoutSelection: FeatureSelection<ProviderId>
  payInProvider: ProviderId | null
  payInSelection: FeatureSelection<ProviderId>
  payInSupported: boolean
  payInEnabled: boolean
  supportNoahPayout: boolean
  supportYcPayout: boolean
  supportGridPayout: boolean
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
  supportGridPayIn: boolean
  crossBorderSupported: boolean
  crossBorderProvider: CrossBorderProviderId | null
  crossBorderSelection: FeatureSelection<CrossBorderProviderId>
  /** Stable provider discovery badges — not affected by routing or enable toggles. */
  showNoahBadge: boolean
  showYcBadge: boolean
  showGridBadge: boolean
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
    String(row.settlement_backend ?? "").toLowerCase() === "noah" ||
    routingPrimaryProvider(row.provider_routing) === "noah"
  )
}

function rowSupportsNoahPayIn(row: PayoutCorridorAdminRow): boolean {
  return rowMetadata(row).noah_receive === true
}

/** Provider badges: discovery / capability only — never routing or *_enabled flags. */
function corridorShowsNoahBadge(row: PayoutCorridorAdminRow): boolean {
  const meta = rowMetadata(row)
  return (
    row.noah_sell_available === true ||
    meta.noah_receive === true ||
    meta.noah_send_enabled === true ||
    routingPrimaryProvider(row.provider_routing) === "noah" ||
    String(row.settlement_backend ?? "").toLowerCase() === "noah"
  )
}

function corridorShowsYcBadge(row: PayoutCorridorAdminRow): boolean {
  const meta = rowMetadata(row)
  return (
    row.yc_send_available === true ||
    row.yc_receive_available === true ||
    meta.yc_send === true ||
    meta.yc_receive === true
  )
}

function corridorShowsGridBadge(row: PayoutCorridorAdminRow): boolean {
  const meta = rowMetadata(row)
  return (
    row.grid_send_available === true ||
    row.grid_receive_available === true ||
    meta.grid_send === true ||
    meta.grid_receive === true
  )
}

function rowPayInEnabledForProvider(row: PayoutCorridorAdminRow, provider: ProviderId): boolean {
  const meta = rowMetadata(row)
  if (provider === "yellowcard" && rowSupportsYcPayIn(row)) return meta.yc_receive_enabled === true
  if (provider === "noah" && rowSupportsNoahPayIn(row)) return meta.noah_receive_enabled === true
  if (provider === "grid" && rowSupportsGridPayIn(row)) return meta.grid_receive_enabled === true
  return false
}

function selectedPayoutProvider(
  row: PayoutCorridorAdminRow,
  caps: CountryCurrencyCaps,
): ProviderId | null {
  const meta = rowMetadata(row)
  if (caps.supportNoahPayout && meta.noah_send_enabled === true) return "noah"
  if (caps.supportYcPayout && meta.yc_send_enabled === true) return "yellowcard"
  if (caps.supportGridPayout && meta.grid_send_enabled === true) return "grid"
  return null
}

function selectedPayInProvider(row: PayoutCorridorAdminRow, caps: CountryCurrencyCaps): ProviderId | null {
  const meta = rowMetadata(row)
  if (caps.supportNoahPayIn && meta.noah_receive_enabled === true) return "noah"
  if (caps.supportYcPayIn && meta.yc_receive_enabled === true) return "yellowcard"
  if (caps.supportGridPayIn && meta.grid_receive_enabled === true) return "grid"
  return null
}

function selectedCrossBorderProvider(
  metadata: Record<string, unknown>,
  crossBorderSupported: boolean,
): CrossBorderProviderId | null {
  if (!crossBorderSupported || metadata.cross_border_enabled !== true) return null
  return parseCrossBorderProvider(metadata)
}

function applyPayoutSendFlags(
  metadata: Record<string, unknown>,
  corridor: PayoutCorridorAdminRow,
  provider: ProviderId,
  enabled: boolean,
): void {
  const caps = rowCaps(corridor)
  if (caps.supportNoahPayout) {
    metadata.noah_send_enabled = provider === "noah" && enabled
  }
  if (caps.supportYcPayout) {
    if (provider === "yellowcard" && enabled) metadata.yc_send = true
    metadata.yc_send_enabled = provider === "yellowcard" && enabled
  }
  if (caps.supportGridPayout) {
    if (provider === "grid" && enabled) metadata.grid_send = true
    metadata.grid_send_enabled = provider === "grid" && enabled
  }
}

function applyPayInReceiveFlags(
  metadata: Record<string, unknown>,
  corridor: PayoutCorridorAdminRow,
  provider: ProviderId,
  enabled: boolean,
): void {
  const caps = rowCaps(corridor)
  if (caps.supportNoahPayIn) {
    metadata.noah_receive_enabled = provider === "noah" && enabled
    if (provider === "noah" && enabled) metadata.noah_receive = true
  }
  if (caps.supportYcPayIn) {
    if (provider === "yellowcard" && enabled) metadata.yc_receive = true
    metadata.yc_receive_enabled = provider === "yellowcard" && enabled
  }
  if (caps.supportGridPayIn) {
    if (provider === "grid" && enabled) metadata.grid_receive = true
    metadata.grid_receive_enabled = provider === "grid" && enabled
  }
}

function disableAllPayoutSendFlags(metadata: Record<string, unknown>, corridor: PayoutCorridorAdminRow): void {
  applyPayoutSendFlags(metadata, corridor, "noah", false)
  applyPayoutSendFlags(metadata, corridor, "yellowcard", false)
  applyPayoutSendFlags(metadata, corridor, "grid", false)
}

function disableAllPayInReceiveFlags(metadata: Record<string, unknown>, corridor: PayoutCorridorAdminRow): void {
  applyPayInReceiveFlags(metadata, corridor, "noah", false)
  applyPayInReceiveFlags(metadata, corridor, "yellowcard", false)
  applyPayInReceiveFlags(metadata, corridor, "grid", false)
}

function applyPayoutChoiceToCorridor(
  corridor: PayoutCorridorAdminRow,
  row: FiatDestinationRow,
  choice: FeatureSelection<ProviderId>,
): PayoutCorridorAdminRow {
  const metadata = { ...rowMetadata(corridor) }
  const payInDisabled = row.payInSelection === "disabled"
  const payInProvider = payInDisabled ? null : row.payInProvider

  if (choice === "disabled") {
    disableAllPayoutSendFlags(metadata, corridor)
    return { ...corridor, metadata, provider_routing: [] }
  }

  applyPayoutSendFlags(metadata, corridor, choice, true)
  if (row.supportNoahPayout && choice !== "noah") metadata.noah_send_enabled = false
  if (row.supportYcPayout && choice !== "yellowcard") metadata.yc_send_enabled = false
  if (row.supportGridPayout && choice !== "grid") metadata.grid_send_enabled = false

  const routing = buildProviderRouting(choice, payInDisabled ? null : payInProvider)
  return { ...corridor, metadata, provider_routing: routing }
}

function applyPayInChoiceToCorridors(
  corridors: PayoutCorridorAdminRow[],
  row: FiatDestinationRow,
  choice: FeatureSelection<ProviderId>,
  filteredRows: PayoutCorridorAdminRow[],
): PayoutCorridorAdminRow[] {
  const payInDisabled = choice === "disabled"
  const provider = payInDisabled ? null : choice
  const routing =
    row.payoutSelection === "disabled" || row.payoutProvider === null
      ? []
      : buildProviderRouting(row.payoutProvider, payInDisabled ? null : provider)
  const payInCorridorIds =
    provider !== null
      ? payInCorridorIdsForProvider(
          filteredRows.filter(
            (c) => c.country_code === row.country_code && c.currency_code === row.currency_code,
          ),
          provider,
        )
      : []
  const routingIds = new Set(row.corridorIds)
  const metadataIds = new Set(
    payInCorridorIds.length > 0 ? payInCorridorIds : row.corridorIds,
  )

  return corridors.map((corridor) => {
    let next = corridor
    if (routingIds.has(corridor.id)) {
      next = { ...next, provider_routing: routing }
    }
    if (metadataIds.has(corridor.id)) {
      const metadata = { ...rowMetadata(next) }
      if (payInDisabled) {
        disableAllPayInReceiveFlags(metadata, corridor)
      } else {
        applyPayInReceiveFlags(metadata, corridor, provider!, true)
        if (row.supportNoahPayIn && provider !== "noah") metadata.noah_receive_enabled = false
        if (row.supportYcPayIn && provider !== "yellowcard") metadata.yc_receive_enabled = false
        if (row.supportGridPayIn && provider !== "grid") metadata.grid_receive_enabled = false
      }
      next = { ...next, metadata }
    }
    return next
  })
}

function applyCrossBorderChoiceToCorridor(
  corridor: PayoutCorridorAdminRow,
  choice: FeatureSelection<CrossBorderProviderId>,
): PayoutCorridorAdminRow {
  const metadata = { ...rowMetadata(corridor) }
  if (choice === "disabled") {
    metadata.cross_border_enabled = false
  } else {
    metadata.cross_border_enabled = true
    metadata.cross_border_provider = choice
  }
  return { ...corridor, metadata }
}

function patchCorridorIdsInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  ids: Iterable<string>,
  patch: (corridor: PayoutCorridorAdminRow) => PayoutCorridorAdminRow,
): void {
  const idSet = new Set(ids)
  queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) =>
    (prev ?? []).map((corridor) => (idSet.has(corridor.id) ? patch(corridor) : corridor)),
  )
}

function mergeCorridorUpdatesInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updates: PayoutCorridorAdminRow[],
): void {
  queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) => {
    const list = prev ?? []
    const byId = new Map(updates.map((u) => [u.id, u]))
    return list.map((r) => {
      const patch = byId.get(r.id)
      if (!patch) return r
      // PATCH returns DB rows without live annotation fields — merge, do not replace.
      return { ...r, ...patch }
    })
  })
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

  if (row.payoutSelection !== "disabled" && row.payoutProvider === "yellowcard" && rowSupportsYcPayout(corridor)) {
    if (enabled) {
      metadata.yc_send = true
      metadata.yc_send_enabled = true
    } else {
      metadata.yc_send_enabled = false
    }
  }
  if (row.payoutSelection !== "disabled" && row.payoutProvider === "grid" && rowSupportsGridPayout(corridor)) {
    if (enabled) {
      metadata.grid_send = true
      metadata.grid_send_enabled = true
    } else {
      metadata.grid_send_enabled = false
    }
  }
  if (row.payoutSelection !== "disabled" && row.payoutProvider === "noah" && rowSupportsNoahPayout(corridor)) {
    metadata.noah_send_enabled = enabled
  }

  if (row.payInSelection !== "disabled" && row.payInProvider === "yellowcard" && rowSupportsYcPayIn(corridor)) {
    if (enabled) {
      metadata.yc_receive = true
      metadata.yc_receive_enabled = true
    } else {
      metadata.yc_receive_enabled = false
    }
  }
  if (row.payInSelection !== "disabled" && row.payInProvider === "grid" && rowSupportsGridPayIn(corridor)) {
    if (enabled) {
      metadata.grid_receive = true
      metadata.grid_receive_enabled = true
    } else {
      metadata.grid_receive_enabled = false
    }
  }
  if (row.payInSelection !== "disabled" && row.payInProvider === "noah" && rowSupportsNoahPayIn(corridor)) {
    metadata.noah_receive_enabled = enabled
    if (enabled) metadata.noah_receive = true
  }

  if (row.payoutSelection === "disabled") {
    disableAllPayoutSendFlags(metadata, corridor)
  }
  if (row.payInSelection === "disabled") {
    disableAllPayInReceiveFlags(metadata, corridor)
  }

  if (
    row.crossBorderSelection !== "disabled" &&
    row.crossBorderSupported &&
    row.crossBorderProvider
  ) {
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
  } else {
    metadata.cross_border_enabled = false
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

function buildProviderRouting(
  payoutProvider: ProviderId,
  payInProvider: ProviderId | null,
): RoutingEntry[] {
  const routing: RoutingEntry[] = [
    { provider: payoutProvider, priority: 1, settlement_asset: "USDC" },
  ]
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

function payoutProviderOptions(row: Pick<
  FiatDestinationRow,
  "supportNoahPayout" | "supportYcPayout" | "supportGridPayout"
>): ProviderId[] {
  return (
    [
      row.supportNoahPayout ? "noah" : null,
      row.supportYcPayout ? "yellowcard" : null,
      row.supportGridPayout ? "grid" : null,
    ] as Array<ProviderId | null>
  ).filter(Boolean) as ProviderId[]
}

function crossBorderProviderOptions(row: Pick<
  FiatDestinationRow,
  "supportYcPayout" | "supportGridPayout"
>): CrossBorderProviderId[] {
  return (
    [
      row.supportYcPayout ? "yellowcard" : null,
      row.supportGridPayout ? "grid" : null,
    ] as Array<CrossBorderProviderId | null>
  ).filter(Boolean) as CrossBorderProviderId[]
}

function FeatureSelect<T extends string>(input: {
  value: FeatureSelection<T>
  ariaLabel: string
  providers: T[]
  labelFor: (provider: T) => string
  onChange: (value: FeatureSelection<T>) => void
}) {
  if (input.providers.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  return (
    <select
      className="h-8 w-full max-w-[148px] rounded-md border bg-background px-2 text-xs"
      value={input.value}
      aria-label={input.ariaLabel}
      onChange={(e) => {
        const raw = e.target.value
        input.onChange(raw === "disabled" ? "disabled" : (raw as T))
      }}
    >
      <option value="disabled">Disable</option>
      {input.providers.map((provider) => (
        <option key={provider} value={provider}>
          {input.labelFor(provider)}
        </option>
      ))}
    </select>
  )
}

type CountryCurrencyCaps = {
  supportNoahPayout: boolean
  supportYcPayout: boolean
  supportGridPayout: boolean
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
  supportGridPayIn: boolean
}

function normalizeCorridorRail(rail: string | null | undefined): "bank_transfer" | "mobile_money" {
  return rail === "mobile_money" ? "mobile_money" : "bank_transfer"
}

function corridorMatchesRailTab(
  row: PayoutCorridorAdminRow,
  railTab: "bank_transfer" | "mobile_money",
): boolean {
  return normalizeCorridorRail(row.rail) === railTab
}

function hasOpsConfiguration(meta: Record<string, unknown>): boolean {
  return (
    meta.noah_send_enabled === true ||
    meta.yc_send_enabled === true ||
    meta.grid_send_enabled === true ||
    meta.noah_receive_enabled === true ||
    meta.yc_receive_enabled === true ||
    meta.grid_receive_enabled === true ||
    meta.cross_border_enabled === true
  )
}

function corridorHasRailCapability(row: PayoutCorridorAdminRow): boolean {
  const cc = row.country_code.trim().toUpperCase()
  const cur = row.currency_code.trim().toUpperCase()
  const rail = normalizeCorridorRail(row.rail)
  if (cc === "NG" && cur === "NGN" && rail === "mobile_money") return false

  if (
    row.noah_sell_available === true ||
    row.yc_send_available === true ||
    row.yc_receive_available === true ||
    row.grid_send_available === true ||
    row.grid_receive_available === true
  ) {
    return true
  }

  const meta = rowMetadata(row)
  if (hasOpsConfiguration(meta)) return true

  const routing = parseRouting(row.provider_routing)
  if (routing.length === 0) return false

  return (
    meta.yc_send === true ||
    meta.yc_receive === true ||
    meta.grid_send === true ||
    meta.grid_receive === true ||
    meta.noah_receive === true
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
    const payoutProvider = selectedPayoutProvider(r, caps)
    const payInProvider = selectedPayInProvider(r, caps)
    const payInSupported =
      payInProviderOptions({
        supportYcPayIn,
        supportNoahPayIn,
        supportGridPayIn,
      }).length > 0
    const railRows = filteredRows.filter(
      (row) => row.country_code === r.country_code && row.currency_code === r.currency_code,
    )
    const payInEnabled =
      payInProvider !== null
        ? railRows.some((row) => rowPayInEnabledForProvider(row, payInProvider))
        : false
    const crossBorderSupported = supportYcPayout || supportGridPayout
    const meta = rowMetadata(r)
    const crossBorderProvider = selectedCrossBorderProvider(meta, crossBorderSupported)
    const payoutSelection: FeatureSelection<ProviderId> = payoutProvider ?? "disabled"
    const payInSelection: FeatureSelection<ProviderId> = payInProvider ?? "disabled"
    const crossBorderSelection: FeatureSelection<CrossBorderProviderId> =
      crossBorderProvider ?? "disabled"
    const showNoahBadge = corridorShowsNoahBadge(r)
    const showYcBadge = corridorShowsYcBadge(r)
    const showGridBadge = corridorShowsGridBadge(r)

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
        payoutSelection,
        payInProvider,
        payInSelection,
        payInSupported,
        payInEnabled,
        supportNoahPayout,
        supportYcPayout,
        supportGridPayout,
        supportYcPayIn,
        supportNoahPayIn,
        supportGridPayIn,
        crossBorderSupported,
        crossBorderProvider,
        crossBorderSelection,
        showNoahBadge,
        showYcBadge,
        showGridBadge,
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
    existing.payoutProvider = payoutProvider
    existing.payoutSelection = payoutProvider ?? "disabled"
    existing.payInSelection = payInProvider ?? "disabled"
    existing.payInCorridorIds =
      payInProvider !== null ? payInCorridorIdsForProvider(railRows, payInProvider) : []
    existing.crossBorderSupported = crossBorderSupported
    existing.crossBorderProvider = crossBorderProvider
    existing.crossBorderSelection = crossBorderProvider ?? "disabled"
    existing.showNoahBadge = existing.showNoahBadge || corridorShowsNoahBadge(r)
    existing.showYcBadge = existing.showYcBadge || corridorShowsYcBadge(r)
    existing.showGridBadge = existing.showGridBadge || corridorShowsGridBadge(r)
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
  const [syncSummary, setSyncSummary] = useState<string | null>(null)
  const [syncingCorridors, setSyncingCorridors] = useState(false)
  const [railTab, setRailTab] = useState<"bank_transfer" | "mobile_money">("bank_transfer")
  const [pricingOpen, setPricingOpen] = useState(false)
  const pricingScope = railTab === "mobile_money" ? "fiat_mobile_money" : "fiat_bank"
  const pricingTitle =
    railTab === "mobile_money" ? "Mobile money processing fees" : "Bank processing fees"
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (r) => corridorMatchesRailTab(r, railTab) && corridorHasRailCapability(r),
      ),
    [rows, railTab],
  )
  const fiatRows = useMemo(() => groupFiatDestinations(filteredRows), [filteredRows])
  const showTableSkeleton = useQueryInitialLoading(corridorsQuery.isPending, corridorsQuery.data, fiatRows)

  const handleSyncCorridors = async () => {
    setSyncingCorridors(true)
    setError(null)
    setSyncSummary(null)
    try {
      const result = await payoutCorridorsApi.syncGridCorridors()
      const p = result.provision
      const s = result.schemas
      const corridorPart = p
        ? `${p.inserted} corridor${p.inserted === 1 ? "" : "s"} added, ${p.updated} updated`
        : null
      const schemaPart = `schemas — Noah ${s.noah.updated}, YC ${s.yellowcard.updated}, Grid ${s.grid.updated}`
      setSyncSummary(
        corridorPart ? `Sync done — ${corridorPart}; ${schemaPart}` : `Sync done — ${schemaPart}`,
      )
      await corridorsQuery.refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Corridor sync failed")
    } finally {
      setSyncingCorridors(false)
    }
  }

  const toggleEnabled = async (row: FiatDestinationRow, enabled: boolean) => {
    const corridorIds = new Set(row.corridorIds)
    queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) => {
      const list = prev ?? []
      return list.map((corridor) => {
        if (!corridorIds.has(corridor.id)) return corridor
        const metadata = applyCorridorLiveMetadata({
          metadata: rowMetadata(corridor),
          corridor,
          row,
          enabled,
        })
        return { ...corridor, enabled, metadata }
      })
    })

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
      mergeCorridorUpdatesInCache(queryClient, updates)
      setError(null)
    } catch (e) {
      await corridorsQuery.refetch()
      setError(e instanceof Error ? e.message : "Save failed")
    }
  }

  const setPayoutChoice = async (row: FiatDestinationRow, choice: FeatureSelection<ProviderId>) => {
    patchCorridorIdsInCache(queryClient, row.corridorIds, (corridor) =>
      applyPayoutChoiceToCorridor(corridor, row, choice),
    )

    try {
      const payInDisabled = row.payInSelection === "disabled"
      const payInProvider = payInDisabled ? null : row.payInProvider
      const updates = await Promise.all(
        row.corridorIds.map((id) => {
          const existing = rows.find((r) => r.id === id) ?? row.sample
          const metadata = { ...rowMetadata(existing) }
          if (choice === "disabled") {
            disableAllPayoutSendFlags(metadata, existing)
            return payoutCorridorsApi.patch(id, { metadata, provider_routing: [] })
          }
          applyPayoutSendFlags(metadata, existing, choice, true)
          if (row.supportNoahPayout && choice !== "noah") metadata.noah_send_enabled = false
          if (row.supportYcPayout && choice !== "yellowcard") metadata.yc_send_enabled = false
          if (row.supportGridPayout && choice !== "grid") metadata.grid_send_enabled = false
          const routing = buildProviderRouting(choice, payInDisabled ? null : payInProvider)
          return payoutCorridorsApi.patch(id, { provider_routing: routing, metadata })
        }),
      )
      mergeCorridorUpdatesInCache(queryClient, updates)
      setError(null)
    } catch (e) {
      await corridorsQuery.refetch()
      setError(e instanceof Error ? e.message : "Save failed")
    }
  }

  const setPayInChoice = async (row: FiatDestinationRow, choice: FeatureSelection<ProviderId>) => {
    queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) =>
      applyPayInChoiceToCorridors(prev ?? [], row, choice, filteredRows),
    )

    try {
      const payInDisabled = choice === "disabled"
      const provider = payInDisabled ? null : choice
      const routing =
        row.payoutSelection === "disabled" || row.payoutProvider === null
          ? []
          : buildProviderRouting(row.payoutProvider, payInDisabled ? null : provider)
      const routingUpdates = await Promise.all(
        row.corridorIds.map((id) => payoutCorridorsApi.patch(id, { provider_routing: routing })),
      )
      const payInCorridorIds =
        provider !== null
          ? payInCorridorIdsForProvider(
              filteredRows.filter(
                (c) => c.country_code === row.country_code && c.currency_code === row.currency_code,
              ),
              provider,
            )
          : []
      const targetIds = payInCorridorIds.length > 0 ? payInCorridorIds : row.corridorIds
      const metaUpdates = await Promise.all(
        targetIds.map((id) => {
          const existing = rows.find((r) => r.id === id) ?? row.sample
          const metadata = { ...rowMetadata(existing) }
          if (payInDisabled) {
            disableAllPayInReceiveFlags(metadata, existing)
            return payoutCorridorsApi.patch(id, { metadata })
          }
          applyPayInReceiveFlags(metadata, existing, provider!, true)
          if (row.supportNoahPayIn && provider !== "noah") metadata.noah_receive_enabled = false
          if (row.supportYcPayIn && provider !== "yellowcard") metadata.yc_receive_enabled = false
          if (row.supportGridPayIn && provider !== "grid") metadata.grid_receive_enabled = false
          return payoutCorridorsApi.patch(id, { metadata })
        }),
      )
      mergeCorridorUpdatesInCache(queryClient, [...routingUpdates, ...metaUpdates])
      setError(null)
    } catch (e) {
      await corridorsQuery.refetch()
      setError(e instanceof Error ? e.message : "Save failed")
    }
  }

  const setCrossBorderChoice = async (
    row: FiatDestinationRow,
    choice: FeatureSelection<CrossBorderProviderId>,
  ) => {
    patchCorridorIdsInCache(queryClient, row.corridorIds, (corridor) =>
      applyCrossBorderChoiceToCorridor(corridor, choice),
    )

    try {
      const updates = await Promise.all(
        row.corridorIds.map((id) => {
          const existing = rows.find((r) => r.id === id) ?? row.sample
          const meta = { ...rowMetadata(existing) }
          if (choice === "disabled") {
            meta.cross_border_enabled = false
          } else {
            meta.cross_border_enabled = true
            meta.cross_border_provider = choice
          }
          return payoutCorridorsApi.patch(id, { metadata: meta })
        }),
      )
      mergeCorridorUpdatesInCache(queryClient, updates)
      setError(null)
    } catch (e) {
      await corridorsQuery.refetch()
      setError(e instanceof Error ? e.message : "Save failed")
    }
  }

  return (
    <PlatformControlTabShell
      title="Fiat corridors"
      maxWidth="max-w-none"
      actions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPricingOpen(true)}>
            Edit pricing
          </Button>
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
            onClick={() => void handleSyncCorridors()}
            disabled={syncingCorridors}
          >
            {syncingCorridors ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Sync corridors
          </Button>
        </div>
      }
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {syncSummary ? <p className="text-sm text-muted-foreground">{syncSummary}</p> : null}
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
              No {railTab === "mobile_money" ? "mobile money" : "bank"} corridors yet. Run Sync corridors to
              provision from provider coverage.
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
                  const payoutProviders = payoutProviderOptions(r)
                  const payInProviders = payInProviderOptions({
                    supportYcPayIn: r.supportYcPayIn,
                    supportNoahPayIn: r.supportNoahPayIn,
                    supportGridPayIn: r.supportGridPayIn,
                  })
                  const crossBorderProviders = crossBorderProviderOptions(r)

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
                          {r.showNoahBadge ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">Noah</span>
                          ) : null}
                          {r.showYcBadge ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">YC</span>
                          ) : null}
                          {r.showGridBadge ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">Grid</span>
                          ) : null}
                          {!r.showNoahBadge && !r.showYcBadge && !r.showGridBadge ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <FeatureSelect
                          value={r.payoutSelection}
                          ariaLabel="Payout provider"
                          providers={payoutProviders}
                          labelFor={providerLabel}
                          onChange={(choice) => void setPayoutChoice(r, choice)}
                        />
                      </TableCell>
                      <TableCell>
                        <FeatureSelect
                          value={r.payInSelection}
                          ariaLabel="Pay-in provider"
                          providers={payInProviders}
                          labelFor={providerLabel}
                          onChange={(choice) => void setPayInChoice(r, choice)}
                        />
                      </TableCell>
                      <TableCell>
                        <FeatureSelect
                          value={r.crossBorderSelection}
                          ariaLabel="Cross-border provider"
                          providers={crossBorderProviders}
                          labelFor={crossBorderProviderLabel}
                          onChange={(choice) => void setCrossBorderChoice(r, choice)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={r.enabled}
                          onCheckedChange={(v) => void toggleEnabled(r, v)}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProcessingFeePricingDialog
        open={pricingOpen}
        onOpenChange={setPricingOpen}
        scope={pricingScope}
        title={pricingTitle}
      />
    </PlatformControlTabShell>
  )
}

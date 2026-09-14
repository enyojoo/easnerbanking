"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { CountryFlag } from "@/components/flags"
import { payoutCorridorsApi, type PayoutCorridorAdminRow } from "@/lib/payout-corridors-api"
import { toast } from "sonner"
import {
  applyUsPayInModeToMetadata,
  bridgeOffersBankPayIn,
  bridgeOffersBankPayout,
  clearUsCrossBorderMetadata,
  corridorOffersCrossBorder,
  isUsUsdCorridor,
  isVaExpressPayInCorridor,
  patchCorridorSurfaceRouting,
  readCorridorSurfaceRouting,
  readCorridorSurfacesMap,
  resolveUsPayInMode,
  settlementAssetForPayoutProvider,
  yellowcardOffersDomesticBankPayout,
  US_PAY_IN_MODE_OPTIONS,
  type CorridorRoutingSurface,
  type CrossBorderProviderId,
  type UsPayInMode,
} from "@easner/shared"
import { officeKeys } from "@/lib/query/keys"
import { buildFiatProcessingFeeDraft } from "@/lib/processing-fee-pricing-draft"
import type { ProcessingFeeScheduleRow } from "@/lib/processing-fee-schedule-api"
import { useOfficePayoutCorridors, useOfficeProcessingFeeSchedule, useQueryInitialLoading } from "@/hooks/queries"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { ProcessingFeePricingDialog } from "@/components/platform-control/processing-fee-pricing-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"

type ProviderId = "noah" | "yellowcard" | "grid" | "bridge"
type FeatureSelection<T extends string> = T | "disabled"

type SurfaceRoutingUi = {
  payoutProvider: ProviderId | null
  payoutSelection: FeatureSelection<ProviderId>
  payInProvider: ProviderId | null
  payInSelection: FeatureSelection<ProviderId>
  usPayInMode: UsPayInMode
  crossBorderProvider: CrossBorderProviderId | null
  crossBorderSelection: FeatureSelection<CrossBorderProviderId>
}

type FiatDestinationRow = {
  key: string
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
  corridorIds: string[]
  payInCorridorIds: string[]
  enabled: boolean
  business: SurfaceRoutingUi
  personal: SurfaceRoutingUi
  payInSupported: boolean
  payInEnabled: boolean
  supportNoahPayout: boolean
  supportYcPayout: boolean
  supportGridPayout: boolean
  supportBridgePayout: boolean
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
  supportGridPayIn: boolean
  supportBridgePayIn: boolean
  crossBorderSupported: boolean
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
    .filter(
      (item) =>
        item.provider === "noah" ||
        item.provider === "yellowcard" ||
        item.provider === "grid" ||
        item.provider === "bridge",
    )
}

function routingPrimaryProvider(routing: unknown): ProviderId | null {
  const sorted = [...parseRouting(routing)].sort((a, b) => a.priority - b.priority)
  const p = sorted[0]?.provider
  if (p === "yellowcard" || p === "noah" || p === "grid" || p === "bridge") return p
  return null
}

function rowMetadata(row: PayoutCorridorAdminRow): Record<string, unknown> {
  return (row.metadata ?? {}) as Record<string, unknown>
}

function rowSupportsYcPayout(row: PayoutCorridorAdminRow): boolean {
  if (!yellowcardOffersDomesticBankPayout(row.country_code, row.currency_code, row.rail)) {
    return false
  }
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
  if (
    isUsUsdCorridor(row.country_code, row.currency_code) &&
    normalizeCorridorRail(row.rail) === "bank_transfer"
  ) {
    return true
  }
  const meta = rowMetadata(row)
  return meta.grid_receive === true || row.grid_receive_available === true
}

function rowSupportsBridgePayout(row: PayoutCorridorAdminRow): boolean {
  if (normalizeCorridorRail(row.rail) === "mobile_money") return false
  const meta = rowMetadata(row)
  return (
    bridgeOffersBankPayout(row.country_code, row.currency_code, row.rail) ||
    meta.bridge_send === true ||
    row.bridge_send_available === true ||
    routingPrimaryProvider(row.provider_routing) === "bridge"
  )
}

function rowSupportsBridgePayIn(row: PayoutCorridorAdminRow): boolean {
  if (normalizeCorridorRail(row.rail) === "mobile_money") return false
  const meta = rowMetadata(row)
  return (
    bridgeOffersBankPayIn(row.country_code, row.currency_code, row.rail) ||
    meta.bridge_receive === true ||
    row.bridge_receive_available === true
  )
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

/** Provider badges: discovery / capability only – never routing or *_enabled flags. */
function rowPayInEnabledForProvider(row: PayoutCorridorAdminRow, provider: ProviderId): boolean {
  const meta = rowMetadata(row)
  if (provider === "yellowcard" && rowSupportsYcPayIn(row)) return meta.yc_receive_enabled === true
  if (provider === "noah" && rowSupportsNoahPayIn(row)) return meta.noah_receive_enabled === true
  if (provider === "grid" && rowSupportsGridPayIn(row)) return meta.grid_receive_enabled === true
  if (provider === "bridge" && rowSupportsBridgePayIn(row)) return meta.bridge_receive_enabled === true
  return false
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
  if (caps.supportBridgePayout) {
    if (provider === "bridge" && enabled) metadata.bridge_send = true
    metadata.bridge_send_enabled = provider === "bridge" && enabled
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
  if (caps.supportBridgePayIn) {
    if (provider === "bridge" && enabled) metadata.bridge_receive = true
    metadata.bridge_receive_enabled = provider === "bridge" && enabled
  }
}

function disableAllPayoutSendFlags(metadata: Record<string, unknown>, corridor: PayoutCorridorAdminRow): void {
  applyPayoutSendFlags(metadata, corridor, "noah", false)
  applyPayoutSendFlags(metadata, corridor, "yellowcard", false)
  applyPayoutSendFlags(metadata, corridor, "grid", false)
  applyPayoutSendFlags(metadata, corridor, "bridge", false)
}

function disableAllPayInReceiveFlags(metadata: Record<string, unknown>, corridor: PayoutCorridorAdminRow): void {
  applyPayInReceiveFlags(metadata, corridor, "noah", false)
  applyPayInReceiveFlags(metadata, corridor, "yellowcard", false)
  applyPayInReceiveFlags(metadata, corridor, "grid", false)
  applyPayInReceiveFlags(metadata, corridor, "bridge", false)
  delete metadata.pay_in_provider
}

function applyPayoutChoiceToCorridor(
  corridor: PayoutCorridorAdminRow,
  row: FiatDestinationRow,
  choice: FeatureSelection<ProviderId>,
  surface: CorridorRoutingSurface,
): PayoutCorridorAdminRow {
  const payout = choice === "disabled" ? null : choice
  const patched = patchCorridorSurfaceRouting(
    {
      provider_routing: corridor.provider_routing,
      metadata: corridor.metadata,
      currency_code: corridor.currency_code,
    },
    surface,
    { payout },
  )
  const metadata = patched.metadata
  if (surface === "personal") {
    return { ...corridor, metadata }
  }

  if (choice === "disabled") {
    disableAllPayoutSendFlags(metadata, corridor)
    if (isUsUsdCorridor(corridor.country_code, corridor.currency_code)) {
      clearUsCrossBorderMetadata(metadata)
    }
    return { ...corridor, metadata, provider_routing: [] }
  }

  applyPayoutSendFlags(metadata, corridor, choice, true)
  if (row.supportNoahPayout && choice !== "noah") metadata.noah_send_enabled = false
  if (row.supportYcPayout && choice !== "yellowcard") metadata.yc_send_enabled = false
  if (row.supportGridPayout && choice !== "grid") metadata.grid_send_enabled = false
  if (row.supportBridgePayout && choice !== "bridge") metadata.bridge_send_enabled = false
  if (isUsUsdCorridor(corridor.country_code, corridor.currency_code)) {
    clearUsCrossBorderMetadata(metadata)
  }
  return { ...corridor, metadata, provider_routing: buildProviderRouting(choice, corridor.currency_code) }
}

function applyPayInChoiceToCorridors(
  corridors: PayoutCorridorAdminRow[],
  row: FiatDestinationRow,
  choice: FeatureSelection<ProviderId>,
  filteredRows: PayoutCorridorAdminRow[],
  surface: CorridorRoutingSurface,
): PayoutCorridorAdminRow[] {
  const payInDisabled = choice === "disabled"
  const provider = payInDisabled ? null : choice
  const businessPayout = row.business.payoutProvider
  const routing =
    row.business.payoutSelection === "disabled" || businessPayout === null
      ? []
      : buildProviderRouting(businessPayout, row.currency_code)
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
    if (surface === "business" && routingIds.has(corridor.id)) {
      next = { ...next, provider_routing: routing }
    }
    if (metadataIds.has(corridor.id)) {
      const patched = patchCorridorSurfaceRouting(
        {
          provider_routing: next.provider_routing,
          metadata: next.metadata,
          currency_code: next.currency_code,
        },
        surface,
        { pay_in: provider },
      )
      const metadata = patched.metadata
      if (surface === "business") {
        if (payInDisabled) {
          disableAllPayInReceiveFlags(metadata, corridor)
          delete metadata.pay_in_provider
        } else {
          applyPayInReceiveFlags(metadata, corridor, provider!, true)
          metadata.pay_in_provider = provider
          if (row.supportNoahPayIn && provider !== "noah") metadata.noah_receive_enabled = false
          if (row.supportYcPayIn && provider !== "yellowcard") metadata.yc_receive_enabled = false
          if (row.supportGridPayIn && provider !== "grid") metadata.grid_receive_enabled = false
          if (row.supportBridgePayIn && provider !== "bridge") metadata.bridge_receive_enabled = false
        }
        if (isUsUsdCorridor(corridor.country_code, corridor.currency_code)) {
          clearUsCrossBorderMetadata(metadata)
        }
      }
      next = { ...next, metadata }
    }
    return next
  })
}

function applyCrossBorderChoiceToCorridor(
  corridor: PayoutCorridorAdminRow,
  choice: FeatureSelection<CrossBorderProviderId>,
  surface: CorridorRoutingSurface,
): PayoutCorridorAdminRow {
  const patched = patchCorridorSurfaceRouting(
    { provider_routing: corridor.provider_routing, metadata: corridor.metadata },
    surface,
    {
      cross_border:
        choice === "disabled" ? null : { enabled: true, provider: choice },
    },
  )
  const metadata = patched.metadata
  if (surface === "business") {
    if (choice === "disabled") {
      metadata.cross_border_enabled = false
    } else {
      metadata.cross_border_enabled = true
      metadata.cross_border_provider = choice
    }
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
      // PATCH returns DB rows without live annotation fields – merge, do not replace.
      return { ...r, ...patch }
    })
  })
}

function routingUiFromCorridor(
  corridor: PayoutCorridorAdminRow,
  caps: CountryCurrencyCaps,
  crossBorderSupported: boolean,
  surface: CorridorRoutingSurface,
): SurfaceRoutingUi {
  const overlay = readCorridorSurfaceRouting(
    { provider_routing: corridor.provider_routing, metadata: corridor.metadata },
    surface,
  )
  const payoutProvider = overlay.payout
  const payInProvider =
    overlay.pay_in &&
    ((overlay.pay_in === "noah" && caps.supportNoahPayIn) ||
      (overlay.pay_in === "yellowcard" && caps.supportYcPayIn) ||
      (overlay.pay_in === "grid" && caps.supportGridPayIn) ||
      (overlay.pay_in === "bridge" && caps.supportBridgePayIn))
      ? overlay.pay_in
      : overlay.pay_in
  const usPayInMode = overlay.pay_in_mode ?? resolveUsPayInMode(rowMetadata(corridor))
  const crossBorderProvider =
    crossBorderSupported && overlay.cross_border?.enabled ? overlay.cross_border.provider : null
  return {
    payoutProvider,
    payoutSelection: payoutProvider ?? "disabled",
    payInProvider,
    payInSelection: payInProvider ?? "disabled",
    usPayInMode,
    crossBorderProvider,
    crossBorderSelection: crossBorderProvider ?? "disabled",
  }
}

function usPayInModeLabel(mode: Exclude<UsPayInMode, "disabled">): string {
  return US_PAY_IN_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode
}

function providerLabel(provider: ProviderId): string {
  if (provider === "yellowcard") return "Yellowcard"
  if (provider === "grid") return "Grid"
  if (provider === "bridge") return "Bridge"
  return "Noah"
}

function crossBorderProviderLabel(provider: CrossBorderProviderId): string {
  return provider === "grid" ? "Grid" : "Yellowcard"
}

function buildProviderRouting(payoutProvider: ProviderId, currencyCode?: string): RoutingEntry[] {
  // Payout-only. Pay-in is stored on metadata.pay_in_provider – never as a
  // secondary provider_routing entry (that caused silent payout failover).
  return [
    {
      provider: payoutProvider,
      priority: 1,
      settlement_asset: settlementAssetForPayoutProvider(payoutProvider, currencyCode),
    },
  ]
}

function defaultVaPayInProvider(
  surface: CorridorRoutingSurface,
  countryCode: string,
  currencyCode: string,
): ProviderId {
  if (surface === "personal") return "bridge"
  if (String(currencyCode).trim().toUpperCase() === "EUR") return "bridge"
  if (isUsUsdCorridor(countryCode, currencyCode)) return "grid"
  return "bridge"
}

function payInProviderOptions(
  caps: {
    supportYcPayIn: boolean
    supportNoahPayIn: boolean
    supportGridPayIn: boolean
    supportBridgePayIn: boolean
  },
  opts?: { surface?: CorridorRoutingSurface; countryCode?: string; currencyCode?: string },
): ProviderId[] {
  const va = Boolean(
    opts?.countryCode &&
      opts.currencyCode &&
      isVaExpressPayInCorridor(opts.countryCode, opts.currencyCode),
  )
  if (va && opts?.surface === "personal") {
    return caps.supportBridgePayIn ? ["bridge"] : []
  }
  if (va && String(opts?.currencyCode ?? "").toUpperCase() === "EUR") {
    return caps.supportBridgePayIn ? ["bridge"] : []
  }
  return (
    [
      caps.supportBridgePayIn ? "bridge" : null,
      caps.supportGridPayIn ? "grid" : null,
      caps.supportYcPayIn ? "yellowcard" : null,
      caps.supportNoahPayIn ? "noah" : null,
    ] as Array<ProviderId | null>
  ).filter(Boolean) as ProviderId[]
}

function payoutProviderOptions(row: Pick<
  FiatDestinationRow,
  | "supportNoahPayout"
  | "supportYcPayout"
  | "supportGridPayout"
  | "supportBridgePayout"
  | "country_code"
  | "currency_code"
>): ProviderId[] {
  const ycOk = yellowcardOffersDomesticBankPayout(row.country_code, row.currency_code, "bank_transfer")
  return (
    [
      row.supportNoahPayout ? "noah" : null,
      row.supportYcPayout && ycOk ? "yellowcard" : null,
      row.supportGridPayout ? "grid" : null,
      row.supportBridgePayout ? "bridge" : null,
    ] as Array<ProviderId | null>
  ).filter(Boolean) as ProviderId[]
}

function crossBorderProviderOptions(row: Pick<
  FiatDestinationRow,
  "supportYcPayout" | "supportGridPayout" | "country_code" | "currency_code"
>): CrossBorderProviderId[] {
  if (!corridorOffersCrossBorder(row.country_code, row.currency_code)) return []
  return (
    [
      row.supportYcPayout ? "yellowcard" : null,
      row.supportGridPayout ? "grid" : null,
    ] as Array<CrossBorderProviderId | null>
  ).filter(Boolean) as CrossBorderProviderId[]
}

function SurfaceSelectRow(input: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] text-muted-foreground">{input.label}</span>
      {input.children}
    </div>
  )
}

function StackedRoutingCell(input: { mismatch: boolean; liveOff: boolean; children: ReactNode }) {
  return (
    <TableCell className={input.mismatch ? "bg-muted/40" : undefined}>
      <div className={`flex flex-col gap-2.5 ${input.liveOff ? "opacity-60" : ""}`}>{input.children}</div>
    </TableCell>
  )
}

function FeatureSelect<T extends string>(input: {
  value: FeatureSelection<T>
  ariaLabel: string
  providers: T[]
  labelFor: (provider: T) => string
  onChange: (value: FeatureSelection<T>) => void
  disabled?: boolean
}) {
  if (input.providers.length === 0) {
    return <span className="text-xs text-muted-foreground">–</span>
  }

  return (
    <select
      className={`h-8 w-full max-w-[148px] rounded-md border bg-background px-2 text-xs ${
        input.disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
      value={input.value}
      aria-label={input.ariaLabel}
      disabled={input.disabled}
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
  supportBridgePayout: boolean
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
  supportGridPayIn: boolean
  supportBridgePayIn: boolean
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
  const surfaces = readCorridorSurfacesMap(meta)
  const overlayLive = (overlay?: { payout: unknown; pay_in: unknown; cross_border: unknown }) =>
    Boolean(overlay?.payout || overlay?.pay_in || overlay?.cross_border)
  if (overlayLive(surfaces?.business) || overlayLive(surfaces?.personal)) return true
  return (
    meta.noah_send_enabled === true ||
    meta.yc_send_enabled === true ||
    meta.grid_send_enabled === true ||
    meta.bridge_send_enabled === true ||
    meta.noah_receive_enabled === true ||
    meta.yc_receive_enabled === true ||
    meta.grid_receive_enabled === true ||
    meta.bridge_receive_enabled === true ||
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
    row.grid_receive_available === true ||
    row.bridge_send_available === true ||
    row.bridge_receive_available === true ||
    rowSupportsBridgePayout(row) ||
    rowSupportsBridgePayIn(row)
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
    meta.bridge_send === true ||
    meta.bridge_receive === true ||
    meta.noah_receive === true
  )
}

function rowCaps(row: PayoutCorridorAdminRow): CountryCurrencyCaps {
  return {
    supportNoahPayout: rowSupportsNoahPayout(row),
    supportYcPayout: rowSupportsYcPayout(row),
    supportGridPayout: rowSupportsGridPayout(row),
    supportBridgePayout: rowSupportsBridgePayout(row),
    supportYcPayIn: rowSupportsYcPayIn(row),
    supportNoahPayIn: rowSupportsNoahPayIn(row),
    supportGridPayIn: rowSupportsGridPayIn(row),
    supportBridgePayIn: rowSupportsBridgePayIn(row),
  }
}

function mergeCaps(a: CountryCurrencyCaps, b: CountryCurrencyCaps): CountryCurrencyCaps {
  return {
    supportNoahPayout: a.supportNoahPayout || b.supportNoahPayout,
    supportYcPayout: a.supportYcPayout || b.supportYcPayout,
    supportGridPayout: a.supportGridPayout || b.supportGridPayout,
    supportBridgePayout: a.supportBridgePayout || b.supportBridgePayout,
    supportYcPayIn: a.supportYcPayIn || b.supportYcPayIn,
    supportNoahPayIn: a.supportNoahPayIn || b.supportNoahPayIn,
    supportGridPayIn: a.supportGridPayIn || b.supportGridPayIn,
    supportBridgePayIn: a.supportBridgePayIn || b.supportBridgePayIn,
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
      if (provider === "bridge") return rowSupportsBridgePayIn(r)
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
            supportBridgePayout: existing.supportBridgePayout,
            supportYcPayIn: existing.supportYcPayIn,
            supportNoahPayIn: existing.supportNoahPayIn,
            supportGridPayIn: existing.supportGridPayIn,
            supportBridgePayIn: existing.supportBridgePayIn,
          },
          rowCaps(r),
        )
      : rowCaps(r)

    const supportNoahPayout = caps.supportNoahPayout
    const supportYcPayout = caps.supportYcPayout
    const supportGridPayout = caps.supportGridPayout
    const supportBridgePayout = caps.supportBridgePayout
    const supportYcPayIn = caps.supportYcPayIn
    const supportNoahPayIn = caps.supportNoahPayIn
    const supportGridPayIn = caps.supportGridPayIn
    const supportBridgePayIn = caps.supportBridgePayIn
    const vaPayInCorridor = isVaExpressPayInCorridor(r.country_code, r.currency_code)
    const payInSupported = vaPayInCorridor
      ? true
      : payInProviderOptions({
          supportYcPayIn,
          supportNoahPayIn,
          supportGridPayIn,
          supportBridgePayIn,
        }).length > 0
    const railRows = filteredRows.filter(
      (row) => row.country_code === r.country_code && row.currency_code === r.currency_code,
    )
    const crossBorderSupported =
      corridorOffersCrossBorder(r.country_code, r.currency_code) &&
      (supportYcPayout || supportGridPayout)
    const business = routingUiFromCorridor(r, caps, crossBorderSupported, "business")
    const personal = routingUiFromCorridor(r, caps, crossBorderSupported, "personal")
    const payInEnabled = vaPayInCorridor
      ? business.usPayInMode !== "disabled" || personal.usPayInMode !== "disabled"
      : (business.payInProvider !== null &&
          railRows.some((row) => rowPayInEnabledForProvider(row, business.payInProvider))) ||
        personal.payInProvider !== null
    if (!existing) {
      map.set(key, {
        key,
        country_code: r.country_code,
        country_name: r.country_name,
        currency_code: r.currency_code,
        currency_name: r.currency_name,
        corridorIds: [r.id],
        payInCorridorIds:
          business.payInProvider !== null
            ? payInCorridorIdsForProvider(railRows, business.payInProvider)
            : personal.payInProvider !== null
              ? payInCorridorIdsForProvider(railRows, personal.payInProvider)
              : [],
        enabled: r.enabled,
        business,
        personal,
        payInSupported,
        payInEnabled,
        supportNoahPayout,
        supportYcPayout,
        supportGridPayout,
        supportBridgePayout,
        supportYcPayIn,
        supportNoahPayIn,
        supportGridPayIn,
        supportBridgePayIn,
        crossBorderSupported,
        sample: r,
      })
      continue
    }

    existing.corridorIds.push(r.id)
    existing.enabled = existing.enabled && r.enabled
    existing.supportNoahPayout = supportNoahPayout
    existing.supportYcPayout = supportYcPayout
    existing.supportGridPayout = supportGridPayout
    existing.supportBridgePayout = supportBridgePayout
    existing.supportYcPayIn = supportYcPayIn
    existing.supportNoahPayIn = supportNoahPayIn
    existing.supportGridPayIn = supportGridPayIn
    existing.supportBridgePayIn = supportBridgePayIn
    existing.business = business
    existing.personal = personal
    existing.payInSupported = payInSupported
    existing.payInEnabled = payInEnabled || existing.payInEnabled
    existing.payInCorridorIds =
      business.payInProvider !== null
        ? payInCorridorIdsForProvider(railRows, business.payInProvider)
        : personal.payInProvider !== null
          ? payInCorridorIdsForProvider(railRows, personal.payInProvider)
          : []
    existing.crossBorderSupported = crossBorderSupported
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
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [railTab, setRailTab] = useState<"bank_transfer" | "mobile_money">("bank_transfer")
  const [pricingOpen, setPricingOpen] = useState(false)
  const [pricingInitialRows, setPricingInitialRows] = useState<ProcessingFeeScheduleRow[] | undefined>()
  const bankFeesQuery = useOfficeProcessingFeeSchedule("fiat_bank")
  const mobileFeesQuery = useOfficeProcessingFeeSchedule("fiat_mobile_money")
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

  const openPricing = () => {
    const stored =
      pricingScope === "fiat_mobile_money" ? mobileFeesQuery.data : bankFeesQuery.data
    setPricingInitialRows(
      buildFiatProcessingFeeDraft(
        fiatRows.map((row) => ({
          country_code: row.country_code,
          country_name: row.country_name,
          currency_code: row.currency_code,
          currency_name: row.currency_name,
        })),
        pricingScope,
        stored,
      ),
    )
    setPricingOpen(true)
  }

  const closePricing = (open: boolean) => {
    setPricingOpen(open)
    if (!open) setPricingInitialRows(undefined)
  }

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
      const schemaPart = `schemas – Noah ${s.noah.updated}, YC ${s.yellowcard.updated}, Grid ${s.grid.updated}`
      setSyncSummary(
        corridorPart ? `Sync done – ${corridorPart}; ${schemaPart}` : `Sync done – ${schemaPart}`,
      )
      await corridorsQuery.refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Corridor sync failed")
    } finally {
      setSyncingCorridors(false)
    }
  }

  const failSave = async (e: unknown) => {
    await corridorsQuery.refetch()
    const message = e instanceof Error ? e.message : "Save failed"
    setError(message)
    toast.error(message)
  }

  const toggleEnabled = async (row: FiatDestinationRow, enabled: boolean) => {
    const key = `${row.key}:live`
    setSavingKey(key)
    const corridorIds = new Set(row.corridorIds)
    queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) =>
      (prev ?? []).map((corridor) => (corridorIds.has(corridor.id) ? { ...corridor, enabled } : corridor)),
    )

    try {
      const updates = await Promise.all(
        row.corridorIds.map((id) => payoutCorridorsApi.patch(id, { enabled })),
      )
      mergeCorridorUpdatesInCache(queryClient, updates)
      setError(null)
    } catch (e) {
      await failSave(e)
    } finally {
      setSavingKey((current) => (current === key ? null : current))
    }
  }

  const setPayoutChoice = async (
    row: FiatDestinationRow,
    choice: FeatureSelection<ProviderId>,
    surface: CorridorRoutingSurface,
  ) => {
    const key = `${row.key}:payout:${surface}`
    setSavingKey(key)
    patchCorridorIdsInCache(queryClient, row.corridorIds, (corridor) =>
      applyPayoutChoiceToCorridor(corridor, row, choice, surface),
    )

    try {
      const updates = await Promise.all(
        row.corridorIds.map((id) => {
          const existing = rows.find((r) => r.id === id) ?? row.sample
          const next = applyPayoutChoiceToCorridor(existing, row, choice, surface)
          return payoutCorridorsApi.patch(id, {
            metadata: next.metadata,
            ...(surface === "business" ? { provider_routing: next.provider_routing } : {}),
          })
        }),
      )
      mergeCorridorUpdatesInCache(queryClient, updates)
      setError(null)
    } catch (e) {
      await failSave(e)
    } finally {
      setSavingKey((current) => (current === key ? null : current))
    }
  }

  const setPayInChoice = async (
    row: FiatDestinationRow,
    choice: FeatureSelection<ProviderId>,
    surface: CorridorRoutingSurface,
  ) => {
    const key = `${row.key}:payin:${surface}`
    setSavingKey(key)
    queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) =>
      applyPayInChoiceToCorridors(prev ?? [], row, choice, filteredRows, surface),
    )

    try {
      const nextRows = applyPayInChoiceToCorridors(rows, row, choice, filteredRows, surface)
      const changed = nextRows.filter((corridor) => row.corridorIds.includes(corridor.id) || row.payInCorridorIds.includes(corridor.id))
      const updates = await Promise.all(
        changed.map((corridor) =>
          payoutCorridorsApi.patch(corridor.id, {
            metadata: corridor.metadata,
            ...(surface === "business" ? { provider_routing: corridor.provider_routing } : {}),
          }),
        ),
      )
      mergeCorridorUpdatesInCache(queryClient, updates)
      setError(null)
    } catch (e) {
      await failSave(e)
    } finally {
      setSavingKey((current) => (current === key ? null : current))
    }
  }

  const setUsPayInMode = async (
    row: FiatDestinationRow,
    choice: FeatureSelection<UsPayInMode>,
    surface: CorridorRoutingSurface,
  ) => {
    const key = `${row.key}:uspayin:${surface}`
    setSavingKey(key)
    const mode: UsPayInMode = choice === "disabled" ? "disabled" : choice
    const payIn =
      mode === "disabled"
        ? null
        : row[surface].payInProvider ??
          defaultVaPayInProvider(surface, row.country_code, row.currency_code)
    queryClient.setQueryData<PayoutCorridorAdminRow[]>(officeKeys.payoutCorridors(), (prev) =>
      (prev ?? []).map((corridor) => {
        if (!row.corridorIds.includes(corridor.id)) return corridor
        const patched = patchCorridorSurfaceRouting(
          {
            provider_routing: corridor.provider_routing,
            metadata: corridor.metadata,
            currency_code: corridor.currency_code,
          },
          surface,
          { pay_in_mode: mode, pay_in: payIn },
        )
        const metadata =
          surface === "business"
            ? applyUsPayInModeToMetadata(patched.metadata, mode, {
                clearCrossBorder: isUsUsdCorridor(corridor.country_code, corridor.currency_code),
              })
            : patched.metadata
        return { ...corridor, metadata }
      }),
    )

    try {
      const updates = await Promise.all(
        row.corridorIds.map((id) => {
          const existing = rows.find((r) => r.id === id) ?? row.sample
          const patched = patchCorridorSurfaceRouting(
            {
              provider_routing: existing.provider_routing,
              metadata: existing.metadata,
              currency_code: existing.currency_code,
            },
            surface,
            { pay_in_mode: mode, pay_in: payIn },
          )
          const metadata =
            surface === "business"
              ? applyUsPayInModeToMetadata(patched.metadata, mode, {
                  clearCrossBorder: isUsUsdCorridor(existing.country_code, existing.currency_code),
                })
              : patched.metadata
          return payoutCorridorsApi.patch(id, { metadata })
        }),
      )
      mergeCorridorUpdatesInCache(queryClient, updates)
      setError(null)
    } catch (e) {
      await failSave(e)
    } finally {
      setSavingKey((current) => (current === key ? null : current))
    }
  }

  const setCrossBorderChoice = async (
    row: FiatDestinationRow,
    choice: FeatureSelection<CrossBorderProviderId>,
    surface: CorridorRoutingSurface,
  ) => {
    if (!corridorOffersCrossBorder(row.country_code, row.currency_code)) return
    const key = `${row.key}:xb:${surface}`
    setSavingKey(key)
    patchCorridorIdsInCache(queryClient, row.corridorIds, (corridor) =>
      applyCrossBorderChoiceToCorridor(corridor, choice, surface),
    )

    try {
      const updates = await Promise.all(
        row.corridorIds.map((id) => {
          const existing = rows.find((r) => r.id === id) ?? row.sample
          const next = applyCrossBorderChoiceToCorridor(existing, choice, surface)
          return payoutCorridorsApi.patch(id, { metadata: next.metadata })
        }),
      )
      mergeCorridorUpdatesInCache(queryClient, updates)
      setError(null)
    } catch (e) {
      await failSave(e)
    } finally {
      setSavingKey((current) => (current === key ? null : current))
    }
  }

  return (
    <PlatformControlTabShell
      title="Fiat corridors"
      maxWidth="max-w-none"
      actions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openPricing} disabled={fiatRows.length === 0}>
            Edit pricing
          </Button>
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button
              type="button"
              className={`px-3 py-1.5 ${railTab === "bank_transfer" ? "bg-muted font-medium" : ""}`}
              onClick={() => {
                setRailTab("bank_transfer")
                setPricingOpen(false)
              }}
            >
              Bank
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 ${railTab === "mobile_money" ? "bg-muted font-medium" : ""}`}
              onClick={() => {
                setRailTab("mobile_money")
                setPricingOpen(false)
              }}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-20 w-[220px] bg-background">Country</TableHead>
                  <TableHead className="w-[200px]">Payout</TableHead>
                  <TableHead className="w-[200px]">Pay-in</TableHead>
                  <TableHead className="w-[200px]">Cross-border</TableHead>
                  <TableHead className="w-[88px] text-right">Live</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_td]:h-auto [&_td]:py-4">
                {fiatRows.map((r) => {
                  const payoutProviders = payoutProviderOptions(r)
                  const payInProviders = payInProviderOptions(
                    {
                      supportYcPayIn: r.supportYcPayIn,
                      supportNoahPayIn: r.supportNoahPayIn,
                      supportGridPayIn: r.supportGridPayIn,
                      supportBridgePayIn: r.supportBridgePayIn,
                    },
                    {
                      surface: "business",
                      countryCode: r.country_code,
                      currencyCode: r.currency_code,
                    },
                  )
                  const mobilePayInProviders = payInProviderOptions(
                    {
                      supportYcPayIn: r.supportYcPayIn,
                      supportNoahPayIn: r.supportNoahPayIn,
                      supportGridPayIn: r.supportGridPayIn,
                      supportBridgePayIn: r.supportBridgePayIn,
                    },
                    {
                      surface: "personal",
                      countryCode: r.country_code,
                      currencyCode: r.currency_code,
                    },
                  )
                  const crossBorderProviders = crossBorderProviderOptions(r)
                  const liveOff = !r.enabled
                  const vaPayInCorridor = isVaExpressPayInCorridor(r.country_code, r.currency_code)
                  const payoutMismatch = r.business.payoutSelection !== r.personal.payoutSelection
                  const payInMismatch = vaPayInCorridor
                    ? r.business.usPayInMode !== r.personal.usPayInMode
                    : r.business.payInSelection !== r.personal.payInSelection
                  const xbMismatch = r.business.crossBorderSelection !== r.personal.crossBorderSelection

                  return (
                    <TableRow key={r.key}>
                      <TableCell className="sticky left-0 z-10 bg-background">
                        <div className="flex items-center gap-2 min-w-0">
                          <CountryFlag code={r.country_code} size={20} />
                          <span className="truncate font-medium">{r.country_name}</span>
                          <span className="text-muted-foreground text-xs shrink-0">{r.currency_code}</span>
                        </div>
                      </TableCell>
                      <StackedRoutingCell mismatch={payoutMismatch} liveOff={liveOff}>
                        <SurfaceSelectRow label="Business">
                          <FeatureSelect
                            value={r.business.payoutSelection}
                            ariaLabel="Business payout provider"
                            providers={payoutProviders}
                            labelFor={providerLabel}
                            disabled={liveOff || savingKey === `${r.key}:payout:business`}
                            onChange={(choice) => void setPayoutChoice(r, choice, "business")}
                          />
                        </SurfaceSelectRow>
                        <SurfaceSelectRow label="Mobile">
                          <FeatureSelect
                            value={r.personal.payoutSelection}
                            ariaLabel="Mobile payout provider"
                            providers={payoutProviders}
                            labelFor={providerLabel}
                            disabled={liveOff || savingKey === `${r.key}:payout:personal`}
                            onChange={(choice) => void setPayoutChoice(r, choice, "personal")}
                          />
                        </SurfaceSelectRow>
                      </StackedRoutingCell>
                      <StackedRoutingCell mismatch={payInMismatch} liveOff={liveOff}>
                        {vaPayInCorridor ? (
                          <>
                            <SurfaceSelectRow label="Business">
                              <FeatureSelect
                                value={r.business.usPayInMode}
                                ariaLabel="Business pay-in mode"
                                providers={US_PAY_IN_MODE_OPTIONS.map((option) => option.value)}
                                labelFor={usPayInModeLabel}
                                disabled={liveOff || savingKey === `${r.key}:uspayin:business`}
                                onChange={(choice) => void setUsPayInMode(r, choice, "business")}
                              />
                            </SurfaceSelectRow>
                            {payInProviders.length > 0 ? (
                              <SurfaceSelectRow label="VA">
                                <FeatureSelect
                                  value={r.business.payInSelection}
                                  ariaLabel="Business pay-in provider"
                                  providers={payInProviders}
                                  labelFor={providerLabel}
                                  disabled={
                                    liveOff ||
                                    r.business.usPayInMode === "disabled" ||
                                    savingKey === `${r.key}:payin:business`
                                  }
                                  onChange={(choice) => void setPayInChoice(r, choice, "business")}
                                />
                              </SurfaceSelectRow>
                            ) : null}
                            <SurfaceSelectRow label="Mobile">
                              <FeatureSelect
                                value={r.personal.usPayInMode}
                                ariaLabel="Mobile pay-in mode"
                                providers={US_PAY_IN_MODE_OPTIONS.map((option) => option.value)}
                                labelFor={usPayInModeLabel}
                                disabled={liveOff || savingKey === `${r.key}:uspayin:personal`}
                                onChange={(choice) => void setUsPayInMode(r, choice, "personal")}
                              />
                            </SurfaceSelectRow>
                            {mobilePayInProviders.length > 0 ? (
                              <SurfaceSelectRow label="VA">
                                <FeatureSelect
                                  value={r.personal.payInSelection}
                                  ariaLabel="Mobile pay-in provider"
                                  providers={mobilePayInProviders}
                                  labelFor={providerLabel}
                                  disabled={
                                    liveOff ||
                                    r.personal.usPayInMode === "disabled" ||
                                    savingKey === `${r.key}:payin:personal`
                                  }
                                  onChange={(choice) => void setPayInChoice(r, choice, "personal")}
                                />
                              </SurfaceSelectRow>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <SurfaceSelectRow label="Business">
                              <FeatureSelect
                                value={r.business.payInSelection}
                                ariaLabel="Business pay-in provider"
                                providers={payInProviders}
                                labelFor={providerLabel}
                                disabled={liveOff || savingKey === `${r.key}:payin:business`}
                                onChange={(choice) => void setPayInChoice(r, choice, "business")}
                              />
                            </SurfaceSelectRow>
                            <SurfaceSelectRow label="Mobile">
                              <FeatureSelect
                                value={r.personal.payInSelection}
                                ariaLabel="Mobile pay-in provider"
                                providers={mobilePayInProviders}
                                labelFor={providerLabel}
                                disabled={liveOff || savingKey === `${r.key}:payin:personal`}
                                onChange={(choice) => void setPayInChoice(r, choice, "personal")}
                              />
                            </SurfaceSelectRow>
                          </>
                        )}
                      </StackedRoutingCell>
                      <StackedRoutingCell mismatch={xbMismatch} liveOff={liveOff}>
                        <SurfaceSelectRow label="Business">
                          <FeatureSelect
                            value={r.business.crossBorderSelection}
                            ariaLabel="Business cross-border provider"
                            providers={crossBorderProviders}
                            labelFor={crossBorderProviderLabel}
                            disabled={liveOff || savingKey === `${r.key}:xb:business`}
                            onChange={(choice) => void setCrossBorderChoice(r, choice, "business")}
                          />
                        </SurfaceSelectRow>
                        <SurfaceSelectRow label="Mobile">
                          <FeatureSelect
                            value={r.personal.crossBorderSelection}
                            ariaLabel="Mobile cross-border provider"
                            providers={crossBorderProviders}
                            labelFor={crossBorderProviderLabel}
                            disabled={liveOff || savingKey === `${r.key}:xb:personal`}
                            onChange={(choice) => void setCrossBorderChoice(r, choice, "personal")}
                          />
                        </SurfaceSelectRow>
                      </StackedRoutingCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={r.enabled}
                          disabled={savingKey === `${r.key}:live`}
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
        onOpenChange={closePricing}
        scope={pricingScope}
        title={pricingTitle}
        initialRows={pricingInitialRows}
      />
    </PlatformControlTabShell>
  )
}

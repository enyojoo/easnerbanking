"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { CountryFlag } from "@/components/flags"
import { payoutCorridorsApi, type PayoutCorridorAdminRow } from "@/lib/payout-corridors-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficePayoutCorridors } from "@/hooks/queries"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { Loader2 } from "lucide-react"

type ProviderId = "noah" | "yellowcard"

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
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
  payoutLocked: ProviderId | null
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
    .filter((item) => item.provider === "noah" || item.provider === "yellowcard")
}

function parsePrimaryProvider(routing: unknown): ProviderId {
  const sorted = [...parseRouting(routing)].sort((a, b) => a.priority - b.priority)
  const p = sorted[0]?.provider
  return p === "yellowcard" ? "yellowcard" : "noah"
}

function rowMetadata(row: PayoutCorridorAdminRow): Record<string, unknown> {
  return (row.metadata ?? {}) as Record<string, unknown>
}

function rowSupportsYcPayout(row: PayoutCorridorAdminRow): boolean {
  const meta = rowMetadata(row)
  return meta.yc_send === true || row.yc_send_available === true
}

function rowSupportsYcPayIn(row: PayoutCorridorAdminRow): boolean {
  const meta = rowMetadata(row)
  return meta.yc_receive === true || row.yc_receive_available === true
}

function rowSupportsNoahPayout(row: PayoutCorridorAdminRow): boolean {
  return (
    row.provider_health?.noah === "ok" || String(row.settlement_backend ?? "").toLowerCase() === "noah"
  )
}

function rowSupportsNoahPayIn(row: PayoutCorridorAdminRow): boolean {
  return rowMetadata(row).noah_receive === true
}

function rowPayInEnabledForProvider(row: PayoutCorridorAdminRow, provider: ProviderId): boolean {
  const meta = rowMetadata(row)
  if (provider === "yellowcard" && rowSupportsYcPayIn(row)) return meta.yc_receive_enabled === true
  if (provider === "noah" && rowSupportsNoahPayIn(row)) return meta.noah_receive_enabled === true
  return false
}

function providerLabel(provider: ProviderId): string {
  return provider === "yellowcard" ? "Yellowcard" : "Noah"
}

function providerBadge(provider: ProviderId): string {
  return provider === "yellowcard" ? "YC" : "Noah"
}

function resolvePayInProvider(input: {
  payoutProvider: ProviderId
  payoutLocked: ProviderId | null
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
}): ProviderId | null {
  if (input.payoutLocked === "noah") {
    if (input.supportYcPayIn) return "yellowcard"
    if (input.supportNoahPayIn) return "noah"
    return null
  }
  if (input.payoutLocked === "yellowcard") {
    if (input.supportYcPayIn) return "yellowcard"
    if (input.supportNoahPayIn) return "noah"
    return null
  }

  const secondary: ProviderId = input.payoutProvider === "noah" ? "yellowcard" : "noah"
  if (secondary === "yellowcard" && input.supportYcPayIn) return "yellowcard"
  if (secondary === "noah" && input.supportNoahPayIn) return "noah"
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
    supportYcPayIn: boolean
    supportNoahPayIn: boolean
  },
): RoutingEntry[] {
  const dualPayout = !input.payoutLocked && input.supportNoahPayout && input.supportYcPayout

  if (input.payoutLocked) {
    const routing: RoutingEntry[] = [
      { provider: input.payoutLocked, priority: 1, settlement_asset: "USDC" },
    ]
    const payInProvider = resolvePayInProvider({
      payoutProvider: input.payoutLocked,
      payoutLocked: input.payoutLocked,
      supportYcPayIn: input.supportYcPayIn,
      supportNoahPayIn: input.supportNoahPayIn,
    })
    if (payInProvider && payInProvider !== input.payoutLocked) {
      routing.push({ provider: payInProvider, priority: 2, settlement_asset: "USDC" })
    }
    return routing
  }

  const secondary: ProviderId = payoutProvider === "noah" ? "yellowcard" : "noah"
  const routing: RoutingEntry[] = [
    { provider: payoutProvider, priority: 1, settlement_asset: "USDC" },
  ]

  if (dualPayout) {
    routing.push({ provider: secondary, priority: 2, settlement_asset: "USDC" })
    return routing
  }

  const payInProvider = resolvePayInProvider({
    payoutProvider,
    payoutLocked: null,
    supportYcPayIn: input.supportYcPayIn,
    supportNoahPayIn: input.supportNoahPayIn,
  })
  if (payInProvider && payInProvider !== payoutProvider) {
    routing.push({ provider: payInProvider, priority: 2, settlement_asset: "USDC" })
  }

  return routing
}

type CountryCurrencyCaps = {
  supportNoahPayout: boolean
  supportYcPayout: boolean
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
}

function buildCountryCurrencyCaps(rows: PayoutCorridorAdminRow[]): Map<string, CountryCurrencyCaps> {
  const map = new Map<string, CountryCurrencyCaps>()
  for (const row of rows) {
    const key = `${row.country_code}:${row.currency_code}`
    const caps = {
      supportNoahPayout: rowSupportsNoahPayout(row),
      supportYcPayout: rowSupportsYcPayout(row),
      supportYcPayIn: rowSupportsYcPayIn(row),
      supportNoahPayIn: rowSupportsNoahPayIn(row),
    }

    const existing = map.get(key)
    if (!existing) {
      map.set(key, caps)
      continue
    }
    existing.supportNoahPayout = existing.supportNoahPayout || caps.supportNoahPayout
    existing.supportYcPayout = existing.supportYcPayout || caps.supportYcPayout
    existing.supportYcPayIn = existing.supportYcPayIn || caps.supportYcPayIn
    existing.supportNoahPayIn = existing.supportNoahPayIn || caps.supportNoahPayIn
  }
  return map
}

function corridorIdsForCountryCurrency(
  allRows: PayoutCorridorAdminRow[],
  countryCode: string,
  currencyCode: string,
): string[] {
  return allRows
    .filter((r) => r.country_code === countryCode && r.currency_code === currencyCode)
    .map((r) => r.id)
}

function payInCorridorIdsForProvider(
  allRows: PayoutCorridorAdminRow[],
  countryCode: string,
  currencyCode: string,
  provider: ProviderId,
): string[] {
  return allRows
    .filter((r) => r.country_code === countryCode && r.currency_code === currencyCode)
    .filter((r) => {
      if (provider === "yellowcard") return rowSupportsYcPayIn(r)
      return rowSupportsNoahPayIn(r)
    })
    .map((r) => r.id)
}

function groupFiatDestinations(
  filteredRows: PayoutCorridorAdminRow[],
  allRows: PayoutCorridorAdminRow[],
): FiatDestinationRow[] {
  const mergedCaps = buildCountryCurrencyCaps(allRows)
  const map = new Map<string, FiatDestinationRow>()

  for (const r of filteredRows) {
    const key = `${r.country_code}:${r.currency_code}`
    const caps = mergedCaps.get(key)
    const supportNoahPayout = caps?.supportNoahPayout ?? rowSupportsNoahPayout(r)
    const supportYcPayout = caps?.supportYcPayout ?? rowSupportsYcPayout(r)
    const supportYcPayIn = caps?.supportYcPayIn ?? rowSupportsYcPayIn(r)
    const supportNoahPayIn = caps?.supportNoahPayIn ?? rowSupportsNoahPayIn(r)
    const payoutLocked: ProviderId | null =
      supportNoahPayout && !supportYcPayout
        ? "noah"
        : !supportNoahPayout && supportYcPayout
          ? "yellowcard"
          : null
    const payoutProvider = parsePrimaryProvider(r.provider_routing)
    const payInProvider = resolvePayInProvider({
      payoutProvider,
      payoutLocked,
      supportYcPayIn,
      supportNoahPayIn,
    })
    const payInSupported = payInProvider !== null
    const payInEnabled =
      payInProvider !== null
        ? allRows
            .filter((row) => row.country_code === r.country_code && row.currency_code === r.currency_code)
            .some((row) => rowPayInEnabledForProvider(row, payInProvider))
        : false

    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        key,
        country_code: r.country_code,
        country_name: r.country_name,
        currency_code: r.currency_code,
        currency_name: r.currency_name,
        corridorIds: [r.id],
        payInCorridorIds:
          payInProvider !== null
            ? payInCorridorIdsForProvider(allRows, r.country_code, r.currency_code, payInProvider)
            : [],
        enabled: r.enabled,
        payoutProvider,
        payInProvider,
        payInSupported,
        payInEnabled,
        supportNoahPayout,
        supportYcPayout,
        supportYcPayIn,
        supportNoahPayIn,
        payoutLocked,
        sample: r,
      })
      continue
    }

    existing.corridorIds.push(r.id)
    existing.enabled = existing.enabled && r.enabled
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
  const fiatRows = useMemo(() => groupFiatDestinations(filteredRows, rows), [filteredRows, rows])
  const showTableSkeleton = corridorsQuery.isPending && fiatRows.length === 0
  const refreshing = corridorsQuery.isFetching && fiatRows.length > 0

  const toggleEnabled = async (row: FiatDestinationRow, enabled: boolean) => {
    setSavingKey(row.key)
    try {
      const updates = await Promise.all(
        row.corridorIds.map((id) => payoutCorridorsApi.patch(id, { enabled })),
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
      const routing = buildProviderRouting(provider, row)
      const targetIds = corridorIdsForCountryCurrency(rows, row.country_code, row.currency_code)
      const updates = await Promise.all(
        targetIds.map((id) => payoutCorridorsApi.patch(id, { provider_routing: routing })),
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

  const setLocalPayIn = async (row: FiatDestinationRow, enabled: boolean) => {
    if (!row.payInProvider) return
    setSavingKey(row.key)
    try {
      const targetIds = row.payInCorridorIds.length > 0 ? row.payInCorridorIds : row.corridorIds
      const updates = await Promise.all(
        targetIds.map((id) => {
          const existing = rows.find((r) => r.id === id)
          const meta = { ...rowMetadata(existing ?? row.sample) }
          const metadata = { ...meta }
          if (row.payInProvider === "yellowcard" && rowSupportsYcPayIn(existing ?? row.sample)) {
            metadata.yc_receive_enabled = enabled
            if (enabled && meta.yc_receive !== true) metadata.yc_receive = true
          }
          if (row.payInProvider === "noah" && rowSupportsNoahPayIn(existing ?? row.sample)) {
            metadata.noah_receive_enabled = enabled
          }
          return payoutCorridorsApi.patch(id, { metadata })
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
            <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : fiatRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No fiat corridors yet. Run corridor seed + YC sync scripts (
              <code className="text-xs">sync-yc-send-corridors.ts</code>).
            </p>
          ) : (
            <Table className="min-w-[920px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Country</TableHead>
                  <TableHead className="w-[120px]">Currency</TableHead>
                  <TableHead className="w-[140px]">Providers</TableHead>
                  <TableHead className="w-[160px]">Payout provider</TableHead>
                  <TableHead className="w-[140px]">Local pay-in</TableHead>
                  <TableHead className="w-[100px] text-right">Live</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fiatRows.map((r) => {
                  const showNoah = r.supportNoahPayout
                  const showYc = r.supportYcPayout || r.supportYcPayIn
                  const canChoosePayout = !r.payoutLocked && r.supportNoahPayout && r.supportYcPayout

                  return (
                    <TableRow key={r.key}>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <CountryFlag code={r.country_code} size={20} />
                          <span className="truncate font-medium">{r.country_name}</span>
                          <span className="text-muted-foreground text-xs shrink-0">{r.country_code}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <span>{r.currency_code}</span>
                        <span className="text-muted-foreground text-xs ml-1 hidden lg:inline">
                          {r.currency_name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {showNoah ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">Noah</span>
                          ) : null}
                          {showYc ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">YC</span>
                          ) : null}
                          {!showNoah && !showYc ? (
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
                            aria-label="Payout provider"
                            onChange={(e) =>
                              void setPayoutProvider(
                                r,
                                e.target.value === "yellowcard" ? "yellowcard" : "noah",
                              )
                            }
                          >
                            <option value="noah">Noah</option>
                            <option value="yellowcard">Yellowcard</option>
                          </select>
                        ) : r.payoutLocked ? (
                          <span className="text-xs font-medium">{providerLabel(r.payoutLocked)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!r.payInSupported || !r.payInProvider ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium shrink-0">
                              {providerBadge(r.payInProvider)}
                            </span>
                            <Switch
                              checked={r.payInEnabled}
                              disabled={savingKey === r.key}
                              onCheckedChange={(v) => void setLocalPayIn(r, v)}
                            />
                          </div>
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

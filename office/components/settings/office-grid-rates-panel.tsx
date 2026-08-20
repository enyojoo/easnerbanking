"use client"

import { useCallback, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { gridRatesApi, type GridRateAdminRow } from "@/lib/grid-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeCurrencies, useOfficeGridRates, useQueryInitialLoading } from "@/hooks/queries"
import { CurrencyFlag } from "@/components/flags"
import { Skeleton } from "@/components/ui/skeleton"
import { Edit, Loader2, MoreHorizontal } from "lucide-react"

const BRIDGE_CODES = new Set(["USD", "USDC"])

type GridRateSourceId = "USD" | "LOCAL" | "CROSS"

type CurrencyRow = {
  id: string
  code: string
  name: string
  symbol: string
  status: string
  flag_svg?: string | null
}

type EditableGridRate = GridRateAdminRow & { _key: string }

type GridRateSourceRow = {
  id: GridRateSourceId
  name: string
  code: string
  pairCount: number
  activePairCount: number
  lastUpdate: string
}

const GRID_RATE_SOURCES: Array<{
  id: GridRateSourceId
  name: string
  code: string
  filter: (row: GridRateAdminRow) => boolean
}> = [
  {
    id: "USD",
    name: "Balance payout",
    code: "USD",
    filter: (r) => r.from_currency === "USD",
  },
  {
    id: "LOCAL",
    name: "Local pay-in",
    code: "LOCAL",
    filter: (r) =>
      r.to_currency === "USD" &&
      !BRIDGE_CODES.has(r.from_currency) &&
      /^[A-Z]{3}$/.test(r.from_currency),
  },
  {
    id: "CROSS",
    name: "Cross-border",
    code: "CROSS",
    filter: (r) =>
      !BRIDGE_CODES.has(r.from_currency) &&
      !BRIDGE_CODES.has(r.to_currency) &&
      r.to_currency !== "USD" &&
      /^[A-Z]{3}$/.test(r.from_currency) &&
      /^[A-Z]{3}$/.test(r.to_currency),
  },
]

function formatAsOf(raw: string | undefined): string {
  if (!raw) return "–"
  const t = new Date(raw)
  if (!Number.isFinite(t.getTime())) return "–"
  return t.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function customerRateFromGridMid(
  row: Pick<GridRateAdminRow, "grid_mid" | "margin_bps" | "rate">,
): number {
  const margin = (Number(row.margin_bps) || 0) / 10_000
  const mid = Number(row.grid_mid) || 0
  if (mid <= 0 || margin < 0 || margin >= 1) return Number(row.rate) || 0
  return Number((mid * (1 - margin)).toPrecision(14))
}

function buildDraftForSource(sourceId: GridRateSourceId, rates: GridRateAdminRow[]): EditableGridRate[] {
  const source = GRID_RATE_SOURCES.find((s) => s.id === sourceId)
  if (!source) return []
  return rates
    .filter(source.filter)
    .sort((a, b) => a.from_currency.localeCompare(b.from_currency) || a.to_currency.localeCompare(b.to_currency))
    .map((row) => ({ ...row, _key: `${row.from_currency}_${row.to_currency}` }))
}

export function OfficeGridRatesPanel() {
  const queryClient = useQueryClient()
  const currenciesQuery = useOfficeCurrencies("rates")
  const ratesQuery = useOfficeGridRates()
  const currencies = (currenciesQuery.data ?? []) as CurrencyRow[]
  const rates = ratesQuery.data ?? []
  const ratesInitialLoading = useQueryInitialLoading(ratesQuery.isPending, ratesQuery.data)
  const currenciesInitialLoading = useQueryInitialLoading(currenciesQuery.isPending, currenciesQuery.data)
  const showTableSkeleton = ratesInitialLoading || currenciesInitialLoading
  const loading = showTableSkeleton
  const queryError = currenciesQuery.error ?? ratesQuery.error
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncSummary, setSyncSummary] = useState<string | null>(null)
  const [editingSource, setEditingSource] = useState<GridRateSourceId | null>(null)
  const [draft, setDraft] = useState<EditableGridRate[]>([])

  const refreshGridRatesData = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: officeKeys.gridRates() })
  }, [queryClient])

  const currencyByCode = useMemo(() => {
    const map = new Map<string, CurrencyRow>()
    for (const c of currencies) {
      map.set(c.code.toUpperCase(), c)
    }
    return map
  }, [currencies])

  const rateSources = useMemo((): GridRateSourceRow[] => {
    return GRID_RATE_SOURCES.map((source) => {
      const pairs = rates.filter(source.filter)
      const activePairs = pairs.filter((r) => r.status === "active")
      let lastMs = 0
      for (const r of pairs) {
        const t = new Date(r.as_of).getTime()
        if (Number.isFinite(t) && t > lastMs) lastMs = t
      }
      return {
        id: source.id,
        name: source.name,
        code: source.code,
        pairCount: pairs.length,
        activePairCount: activePairs.length,
        lastUpdate: lastMs > 0 ? formatAsOf(new Date(lastMs).toISOString()) : "–",
      }
    })
  }, [rates])

  const handleSyncRates = useCallback(async () => {
    setSyncing(true)
    setError(null)
    setSyncSummary(null)
    try {
      const result = await gridRatesApi.syncFromGrid()
      setSyncSummary(`Updated ${result.upserted}, skipped ${result.skipped}`)
      await refreshGridRatesData()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }, [refreshGridRatesData])

  const openEditRates = (id: GridRateSourceId) => {
    setEditingSource(id)
    setDraft(buildDraftForSource(id, rates))
  }

  const closeEditRates = () => {
    setEditingSource(null)
    setDraft([])
  }

  const updateDraft = (key: string, patch: Partial<EditableGridRate>) => {
    setDraft((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)))
  }

  const recalcDraftRate = (key: string) => {
    setDraft((prev) =>
      prev.map((r) => {
        if (r._key !== key) return r
        return { ...r, rate: customerRateFromGridMid(r) }
      }),
    )
  }

  const handleSaveEditRates = async () => {
    if (!editingSource) return
    setSaving(true)
    setError(null)
    try {
      const payload = draft.map(({ _key: _unused, ...row }) => ({
        from_currency: row.from_currency,
        to_currency: row.to_currency,
        rate: Number(row.rate) || 0,
        grid_mid: row.grid_mid,
        margin_bps: Number(row.margin_bps) || 0,
        status: row.status || "active",
      }))
      if (payload.length > 0) {
        await gridRatesApi.upsert(payload)
      }
      closeEditRates()
      await refreshGridRatesData()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const editingMeta = editingSource
    ? rateSources.find((s) => s.id === editingSource) ??
      GRID_RATE_SOURCES.find((s) => s.id === editingSource)
    : null

  return (
    <PlatformControlTabShell
      title="Grid rates"
      actions={
        <Button type="button" size="sm" onClick={() => void handleSyncRates()} disabled={syncing || loading}>
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sync rates
        </Button>
      }
    >
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {!error && queryError ? (
        <p className="text-sm text-destructive" role="alert">
          {queryError instanceof Error ? queryError.message : "Failed to load Grid rates"}
        </p>
      ) : null}
      {syncSummary ? <p className="text-sm text-muted-foreground">{syncSummary}</p> : null}

      <Card>
        <CardContent className="p-0">
          {showTableSkeleton ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rate source</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Pairs</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateSources.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        {source.id === "USD" ? (
                          <CurrencyFlag currency="USD" size={16} />
                        ) : (
                          <span className="inline-flex h-4 w-6 items-center justify-center rounded-sm bg-muted text-[9px] font-medium text-muted-foreground">
                            {source.code.slice(0, 2)}
                          </span>
                        )}
                        {source.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{source.code}</TableCell>
                    <TableCell>
                      {source.pairCount === 0 ? (
                        <span className="text-muted-foreground text-sm">None – run Sync rates</span>
                      ) : (
                        <span>
                          {source.activePairCount} active
                          {source.pairCount !== source.activePairCount
                            ? ` / ${source.pairCount} total`
                            : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{source.lastUpdate}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={source.pairCount === 0}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditRates(source.id)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit rates
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editingSource != null}
        onOpenChange={(open) => {
          if (!open) closeEditRates()
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader className="border-b pb-4">
            <DialogTitle>
              Edit Grid rates – {editingMeta?.name ?? editingSource} ({editingSource})
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2 space-y-4">
            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No pairs for {editingSource}. Run Sync rates after enabling Grid corridors.
              </p>
            ) : (
              draft.map((row) => (
                <div key={row._key} className="rounded-lg border p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium flex items-center gap-2 flex-wrap">
                      <CurrencyFlag
                        currency={row.from_currency}
                        size={16}
                        fallbackSvg={currencyByCode.get(row.from_currency)?.flag_svg}
                      />
                      {row.from_currency}
                      <span className="text-muted-foreground">→</span>
                      <CurrencyFlag
                        currency={row.to_currency}
                        size={16}
                        fallbackSvg={currencyByCode.get(row.to_currency)?.flag_svg}
                      />
                      {row.to_currency}
                      {row.country_code ? (
                        <span className="text-xs text-muted-foreground font-normal">
                          ({row.country_code})
                        </span>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant={row.source === "office" ? "default" : "secondary"}>
                        {row.source || "sync"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatAsOf(row.as_of)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Grid mid</Label>
                      <Input
                        type="number"
                        step="0.000001"
                        value={row.grid_mid ?? ""}
                        onChange={(e) =>
                          updateDraft(row._key, {
                            grid_mid: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Customer rate</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.000001"
                          value={row.rate}
                          onChange={(e) =>
                            updateDraft(row._key, { rate: parseFloat(e.target.value) || 0 })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => recalcDraftRate(row._key)}
                          disabled={row.grid_mid == null}
                        >
                          Recalc
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Margin (bps)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={row.margin_bps}
                        onChange={(e) =>
                          updateDraft(row._key, { margin_bps: parseInt(e.target.value, 10) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={row.status}
                        onValueChange={(v) => updateDraft(row._key, { status: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="pending_sync">Pending sync</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={closeEditRates} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEditRates()} disabled={saving || draft.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformControlTabShell>
  )
}

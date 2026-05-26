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
import { isNoahRateRowStale, noahRatesApi, type NoahRateAdminRow } from "@/lib/noah-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeCurrencies, useOfficeNoahRates } from "@/hooks/queries"
import { CurrencyFlag } from "@/components/flags"
import { Edit, Loader2, MoreHorizontal } from "lucide-react"

const WALLET_SOURCES = ["USD", "EUR"] as const
type WalletSourceCode = (typeof WALLET_SOURCES)[number]

type CurrencyRow = {
  id: string
  code: string
  name: string
  symbol: string
  status: string
  flag_svg?: string | null
}

type EditableNoahRate = NoahRateAdminRow & { _key: string }

type WalletSourceRow = {
  code: WalletSourceCode
  name: string
  symbol: string
  flag_svg?: string | null
  pairCount: number
  activePairCount: number
  stalePairCount: number
  lastUpdate: string
}

function formatAsOf(raw: string | undefined): string {
  if (!raw) return "—"
  const t = new Date(raw)
  if (!Number.isFinite(t.getTime())) return "—"
  return t.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function defaultWalletMeta(code: WalletSourceCode): Omit<WalletSourceRow, "pairCount" | "activePairCount" | "stalePairCount" | "lastUpdate"> {
  if (code === "EUR") {
    return { code, name: "Euro", symbol: "€" }
  }
  return { code, name: "US Dollar", symbol: "$" }
}

function buildDraftForSource(fromCode: WalletSourceCode, rates: NoahRateAdminRow[]): EditableNoahRate[] {
  return rates
    .filter((r) => r.from_currency === fromCode)
    .sort((a, b) => a.to_currency.localeCompare(b.to_currency))
    .map((row) => ({ ...row, _key: `${row.from_currency}_${row.to_currency}` }))
}

function customerRateFromMid(noahMid: number, marginBps: number): number {
  if (!Number.isFinite(noahMid) || noahMid <= 0) return 0
  const margin = marginBps / 10_000
  if (margin < 0 || margin >= 1) return noahMid
  return Number((noahMid * (1 - margin)).toPrecision(14))
}

export function OfficeNoahRatesPanel() {
  const queryClient = useQueryClient()
  const currenciesQuery = useOfficeCurrencies("rates")
  const ratesQuery = useOfficeNoahRates()
  const currencies = (currenciesQuery.data ?? []) as CurrencyRow[]
  const rates = ratesQuery.data ?? []
  const loading = ratesQuery.isPending && rates.length === 0
  const queryError = currenciesQuery.error ?? ratesQuery.error
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncSummary, setSyncSummary] = useState<string | null>(null)
  const [editingSource, setEditingSource] = useState<WalletSourceCode | null>(null)
  const [draft, setDraft] = useState<EditableNoahRate[]>([])

  const refreshNoahRatesData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: officeKeys.currencies("rates") }),
      queryClient.invalidateQueries({ queryKey: officeKeys.noahRates() }),
    ])
  }, [queryClient])

  const currencyByCode = useMemo(() => {
    const map = new Map<string, CurrencyRow>()
    for (const c of currencies) {
      map.set(c.code.toUpperCase(), c)
    }
    return map
  }, [currencies])

  const walletSources = useMemo((): WalletSourceRow[] => {
    return WALLET_SOURCES.map((code) => {
      const meta = currencyByCode.get(code) ?? defaultWalletMeta(code)
      const pairs = rates.filter((r) => r.from_currency === code)
      const activePairs = pairs.filter((r) => r.status === "active")
      let lastMs = 0
      for (const r of pairs) {
        for (const raw of [r.as_of, r.updated_at]) {
          if (!raw) continue
          const t = new Date(raw).getTime()
          if (Number.isFinite(t) && t > lastMs) lastMs = t
        }
      }
      return {
        code,
        name: meta.name,
        symbol: meta.symbol,
        flag_svg: meta.flag_svg,
        pairCount: pairs.length,
        activePairCount: activePairs.length,
        stalePairCount: activePairs.filter((r) => isNoahRateRowStale(r)).length,
        lastUpdate:
          lastMs > 0
            ? new Date(lastMs).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "—",
      }
    })
  }, [rates, currencyByCode])

  const totalStalePairs = useMemo(
    () => rates.filter((r) => r.status === "active" && isNoahRateRowStale(r)).length,
    [rates],
  )

  const handleSyncRates = useCallback(async () => {
    setSyncing(true)
    setError(null)
    setSyncSummary(null)
    try {
      const result = await noahRatesApi.syncFromNoah()
      setSyncSummary(
        `Updated ${result.updated}, skipped ${result.skipped}${
          result.skippedPairs.length
            ? ` — ${result.skippedPairs.slice(0, 8).join(", ")}`
            : ""
        }`,
      )
      await refreshNoahRatesData()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }, [refreshNoahRatesData])

  const openEditRates = (code: WalletSourceCode) => {
    setEditingSource(code)
    setDraft(buildDraftForSource(code, rates))
  }

  const closeEditRates = () => {
    setEditingSource(null)
    setDraft([])
  }

  const updateDraft = (key: string, patch: Partial<EditableNoahRate>) => {
    setDraft((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)))
  }

  const recalcDraftRate = (key: string) => {
    setDraft((prev) =>
      prev.map((r) => {
        if (r._key !== key) return r
        return { ...r, rate: customerRateFromMid(Number(r.noah_mid) || 0, Number(r.margin_bps) || 0) }
      }),
    )
  }

  const handleSaveEditRates = async () => {
    if (!editingSource) return
    setSaving(true)
    setError(null)
    try {
      const payload = draft.map(({ _key: _unused, id, updated_at, source, as_of, ...row }) => ({
        from_currency: row.from_currency,
        to_currency: row.to_currency,
        rate: Number(row.rate) || 0,
        noah_mid: Number(row.noah_mid) || 0,
        margin_bps: Number(row.margin_bps) || 0,
        fee_type: row.fee_type,
        fee_amount: Number(row.fee_amount) || 0,
        min_amount: row.min_amount ?? null,
        max_amount: row.max_amount ?? null,
        status: row.status || "active",
      }))
      if (payload.length > 0) {
        await noahRatesApi.upsert(payload)
      }
      closeEditRates()
      await refreshNoahRatesData()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const editingMeta = editingSource
    ? walletSources.find((w) => w.code === editingSource) ?? defaultWalletMeta(editingSource)
    : null

  const showTableSkeleton = loading && rates.length === 0

  return (
    <PlatformControlTabShell
      title="Noah rates (global payout)"
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
          {queryError instanceof Error ? queryError.message : "Failed to load Noah rates"}
        </p>
      ) : null}
      {syncSummary ? <p className="text-sm text-muted-foreground">{syncSummary}</p> : null}
      {totalStalePairs > 0 ? (
        <p className="text-sm text-amber-700">
          {totalStalePairs} active pair{totalStalePairs === 1 ? "" : "s"} exceed the 5‑minute TTL — cross-currency balance send is blocked until sync.
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {showTableSkeleton ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Balance currency</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Pairs</TableHead>
                  <TableHead>Stale</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {walletSources.map((wallet) => (
                  <TableRow key={wallet.code}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <CurrencyFlag currency={wallet.code} size={16} fallbackSvg={wallet.flag_svg} />
                        {wallet.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{wallet.code}</TableCell>
                    <TableCell>
                      {wallet.pairCount === 0 ? (
                        <span className="text-muted-foreground text-sm">None — run Sync rates</span>
                      ) : (
                        <span>
                          {wallet.activePairCount} active
                          {wallet.pairCount !== wallet.activePairCount
                            ? ` / ${wallet.pairCount} total`
                            : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {wallet.stalePairCount > 0 ? (
                        <Badge variant="destructive">{wallet.stalePairCount} stale</Badge>
                      ) : wallet.activePairCount > 0 ? (
                        <Badge variant="secondary">Fresh</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{wallet.lastUpdate}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={wallet.pairCount === 0}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditRates(wallet.code)}>
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
              Edit Noah rates — {editingMeta?.name} ({editingSource})
            </DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">
              Office saves set <code className="text-xs">source=office</code>. Noah mid + margin drive customer rate on send preview.
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2 space-y-4">
            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No payout pairs for {editingSource}. Run Sync rates after enabling payout corridors.
              </p>
            ) : (
              draft.map((row) => {
                const feeType = row.fee_type
                const from = editingSource ?? row.from_currency
                const stale = row.status === "active" && isNoahRateRowStale(row)
                const destMeta = currencyByCode.get(row.to_currency)
                return (
                  <div key={row._key} className="rounded-lg border p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium flex items-center gap-2">
                        <CurrencyFlag
                          currency={from}
                          size={16}
                          fallbackSvg={currencyByCode.get(from)?.flag_svg}
                        />
                        {from}
                        <span className="text-muted-foreground">→</span>
                        <CurrencyFlag
                          currency={row.to_currency}
                          size={16}
                          fallbackSvg={destMeta?.flag_svg}
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
                        {stale ? <Badge variant="destructive">Stale</Badge> : null}
                        <span className="text-xs text-muted-foreground">{formatAsOf(row.as_of)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Noah mid</Label>
                        <Input
                          type="number"
                          step="0.000001"
                          value={row.noah_mid}
                          onChange={(e) =>
                            updateDraft(row._key, { noah_mid: parseFloat(e.target.value) || 0 })
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
                      <div className="space-y-2">
                        <Label>Fee type</Label>
                        <Select
                          value={feeType}
                          onValueChange={(v) =>
                            updateDraft(row._key, { fee_type: v as EditableNoahRate["fee_type"] })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="fixed">Fixed</SelectItem>
                            <SelectItem value="percentage">Percentage</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{feeType === "percentage" ? "Fee (%)" : `Fee (${from})`}</Label>
                        <Input
                          type="number"
                          step="any"
                          disabled={feeType === "free"}
                          value={row.fee_amount}
                          onChange={(e) =>
                            updateDraft(row._key, { fee_amount: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Min ({from})</Label>
                        <Input
                          type="number"
                          step="any"
                          value={row.min_amount ?? ""}
                          onChange={(e) =>
                            updateDraft(row._key, {
                              min_amount: e.target.value ? parseFloat(e.target.value) : null,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Max ({from})</Label>
                        <Input
                          type="number"
                          step="any"
                          value={row.max_amount ?? ""}
                          onChange={(e) =>
                            updateDraft(row._key, {
                              max_amount: e.target.value ? parseFloat(e.target.value) : null,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )
              })
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

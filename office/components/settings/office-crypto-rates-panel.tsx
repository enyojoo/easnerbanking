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
import { cryptoRatesApi, type CryptoRateAdminRow } from "@/lib/crypto-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeCurrencies, useOfficeCryptoRates, useQueryInitialLoading } from "@/hooks/queries"
import { CurrencyFlag, getNetworkIconUrl, getTokenIconUrl, StableImage } from "@easner/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { Edit, Loader2, MoreHorizontal } from "lucide-react"

const WALLET_SOURCES = ["USD", "EUR"] as const
type WalletSourceCode = (typeof WALLET_SOURCES)[number]

function CryptoIcon({ src, label, size = 18 }: { src?: string; label: string; size?: number }) {
  if (src) {
    return (
      <StableImage
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
      />
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  )
}

function CryptoTokenIcon({ code, size = 18 }: { code: string; size?: number }) {
  return <CryptoIcon src={getTokenIconUrl(code)} label={code} size={size} />
}

function CryptoNetworkIcon({ network, size = 16 }: { network: string; size?: number }) {
  return <CryptoIcon src={getNetworkIconUrl(network)} label={network} size={size} />
}

function formatCryptoRateSource(source: string | null | undefined): string {
  return String(source || "sync").trim() || "sync"
}

type CurrencyRow = {
  id: string
  code: string
  name: string
  symbol: string
  status: string
  flag_svg?: string | null
}

type EditableCryptoRate = CryptoRateAdminRow & { _key: string }

type WalletSourceRow = {
  code: WalletSourceCode
  name: string
  symbol: string
  flag_svg?: string | null
  pairCount: number
  activePairCount: number
  lastUpdate: string
}

function formatAsOf(raw: string | undefined): string {
  if (!raw) return "–"
  const t = new Date(raw)
  if (!Number.isFinite(t.getTime())) return "–"
  return t.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function defaultWalletMeta(code: WalletSourceCode): Omit<WalletSourceRow, "pairCount" | "activePairCount" | "lastUpdate"> {
  if (code === "EUR") {
    return { code, name: "Euro", symbol: "€" }
  }
  return { code, name: "US Dollar", symbol: "$" }
}

function buildDraftForSource(fromCode: WalletSourceCode, rates: CryptoRateAdminRow[]): EditableCryptoRate[] {
  return rates
    .filter((r) => r.from_currency === fromCode)
    .sort((a, b) => {
      const asset = a.to_currency.localeCompare(b.to_currency)
      if (asset !== 0) return asset
      return a.receive_network.localeCompare(b.receive_network)
    })
    .map((row) => ({
      ...row,
      _key: `${row.from_currency}_${row.to_currency}_${row.receive_network}`,
    }))
}

function customerRateFromMid(bridgeMid: number, marginBps: number): number {
  if (!Number.isFinite(bridgeMid) || bridgeMid <= 0) return 0
  const margin = marginBps / 10_000
  if (margin < 0 || margin >= 1) return bridgeMid
  return Number((bridgeMid * (1 - margin)).toPrecision(14))
}

export function OfficeCryptoRatesPanel() {
  const queryClient = useQueryClient()
  const currenciesQuery = useOfficeCurrencies("rates")
  const ratesQuery = useOfficeCryptoRates()
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
  const [editingSource, setEditingSource] = useState<WalletSourceCode | null>(null)
  const [draft, setDraft] = useState<EditableCryptoRate[]>([])

  const refreshCryptoRatesData = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: officeKeys.cryptoRates() })
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
        lastUpdate:
          lastMs > 0
            ? new Date(lastMs).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "–",
      }
    })
  }, [rates, currencyByCode])

  const handleSyncRates = useCallback(async () => {
    setSyncing(true)
    setError(null)
    setSyncSummary(null)
    try {
      const result = await cryptoRatesApi.syncFromRelay()
      setSyncSummary(
        `Updated ${result.updated}, skipped ${result.skipped}${
          result.skippedPairs.length
            ? ` – ${result.skippedPairs.slice(0, 8).join(", ")}`
            : ""
        }`,
      )
      await refreshCryptoRatesData()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }, [refreshCryptoRatesData])

  const openEditRates = (code: WalletSourceCode) => {
    setEditingSource(code)
    setDraft(buildDraftForSource(code, rates))
  }

  const closeEditRates = () => {
    setEditingSource(null)
    setDraft([])
  }

  const updateDraft = (key: string, patch: Partial<EditableCryptoRate>) => {
    setDraft((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)))
  }

  const recalcDraftRate = (key: string) => {
    setDraft((prev) =>
      prev.map((r) => {
        if (r._key !== key) return r
        return { ...r, rate: customerRateFromMid(Number(r.bridge_mid) || 0, Number(r.margin_bps) || 0) }
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
        receive_network: row.receive_network,
        rate: Number(row.rate) || 0,
        bridge_mid: Number(row.bridge_mid) || 0,
        margin_bps: Number(row.margin_bps) || 0,
        status: row.status || "active",
      }))
      if (payload.length > 0) {
        await cryptoRatesApi.upsert(payload)
      }
      closeEditRates()
      await refreshCryptoRatesData()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const editingMeta = editingSource
    ? walletSources.find((w) => w.code === editingSource) ?? defaultWalletMeta(editingSource)
    : null

  return (
    <PlatformControlTabShell
      title="Crypto rates"
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
          {queryError instanceof Error ? queryError.message : "Failed to load crypto rates"}
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
                  <TableHead>Balance currency</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Corridors</TableHead>
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
                        <span className="text-muted-foreground text-sm">None – run Sync rates</span>
                      ) : (
                        <span>
                          {wallet.activePairCount} active
                          {wallet.pairCount !== wallet.activePairCount
                            ? ` / ${wallet.pairCount} total`
                            : ""}
                        </span>
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
              Edit crypto rates – {editingMeta?.name} ({editingSource})
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2 space-y-4">
            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No wallet send corridors for {editingSource}. Run Sync rates after enabling crypto destinations.
              </p>
            ) : (
              draft.map((row) => {
                const from = editingSource ?? row.from_currency
                return (
                  <div key={row._key} className="rounded-lg border p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium flex items-center gap-2 flex-wrap">
                        <CurrencyFlag
                          currency={from}
                          size={16}
                          fallbackSvg={currencyByCode.get(from)?.flag_svg}
                        />
                        {from}
                        <span className="text-muted-foreground">→</span>
                        <CryptoTokenIcon code={row.to_currency} size={18} />
                        {row.to_currency}
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-sm font-normal">
                          <CryptoNetworkIcon network={row.receive_network} size={16} />
                          {row.receive_network}
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant={row.source === "office" ? "default" : "secondary"}>
                          {formatCryptoRateSource(row.source)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatAsOf(row.as_of)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Relay mid</Label>
                        <Input
                          type="number"
                          step="0.000001"
                          value={row.bridge_mid}
                          onChange={(e) =>
                            updateDraft(row._key, { bridge_mid: parseFloat(e.target.value) || 0 })
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

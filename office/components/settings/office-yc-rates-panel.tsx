"use client"

import { useCallback, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ycRatesApi, type YcRateAdminRow } from "@/lib/yc-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeYcRates } from "@/hooks/queries/use-office-yc-rates"
import { CurrencyFlag } from "@/components/flags"
import { Loader2 } from "lucide-react"

function formatRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return "—"
  if (rate >= 100) return rate.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return rate.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

export function OfficeYcRatesPanel() {
  const queryClient = useQueryClient()
  const ratesQuery = useOfficeYcRates()
  const rates = ratesQuery.data ?? []
  const loading = ratesQuery.isPending && rates.length === 0
  const queryError = ratesQuery.error
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncSummary, setSyncSummary] = useState<string | null>(null)

  const refreshRates = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: officeKeys.ycRates() })
  }, [queryClient])

  const handleSyncRates = useCallback(async () => {
    setSyncing(true)
    setError(null)
    setSyncSummary(null)
    try {
      const result = await ycRatesApi.syncFromYellowcard()
      await refreshRates()
      setSyncSummary(
        `Synced ${result.updated} pair(s)${result.skipped ? `, skipped ${result.skipped}` : ""}.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }, [refreshRates])

  const lastRatesUpdate = useMemo(() => {
    let maxMs = 0
    for (const r of rates) {
      const t = new Date(r.as_of).getTime()
      if (Number.isFinite(t) && t > maxMs) maxMs = t
    }
    return maxMs > 0
      ? new Date(maxMs).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "—"
  }, [rates])

  const sortedRates = useMemo(() => {
    return [...rates].sort((a, b) => {
      const af = a.from_currency.localeCompare(b.from_currency)
      if (af !== 0) return af
      return a.to_currency.localeCompare(b.to_currency)
    })
  }, [rates])

  return (
    <PlatformControlTabShell
      title="Yellowcard rates"
      description={`Customer FX for Yellowcard local pay-in, fund balance, and cross-border send. Includes USDC legs and cross pairs. Last sync: ${lastRatesUpdate}.`}
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
          {queryError instanceof Error ? queryError.message : "Failed to load Yellowcard rates"}
        </p>
      ) : null}
      {syncSummary ? <p className="text-sm text-muted-foreground">{syncSummary}</p> : null}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : sortedRates.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">
              No Yellowcard rates yet. Click Sync rates to pull provider mid rates and apply Easner margin.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Customer rate</TableHead>
                  <TableHead className="text-right">YC sell</TableHead>
                  <TableHead className="text-right">Margin (bps)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>As of</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRates.map((row: YcRateAdminRow) => (
                  <TableRow key={`${row.from_currency}-${row.to_currency}-${row.country_code ?? ""}`}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <CurrencyFlag currency={row.from_currency} size={14} />
                        {row.from_currency}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <CurrencyFlag currency={row.to_currency} size={14} />
                        {row.to_currency}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatRate(row.rate)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatRate(row.easner_sell ?? row.yc_sell)}
                    </TableCell>
                    <TableCell className="text-right text-sm">{row.margin_bps}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {row.as_of
                        ? new Date(row.as_of).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PlatformControlTabShell>
  )
}

"use client"

import { useCallback, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { gridRatesApi, type GridRateAdminRow } from "@/lib/grid-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeGridRates, useQueryInitialLoading } from "@/hooks/queries"
import { CurrencyFlag } from "@/components/flags"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"

const BRIDGE_CODES = new Set(["USD", "USDC"])

type GridRateSourceId = "USD" | "CROSS"

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
    id: "CROSS",
    name: "Cross-border",
    code: "CROSS",
    filter: (r) =>
      !BRIDGE_CODES.has(r.from_currency) &&
      !BRIDGE_CODES.has(r.to_currency) &&
      /^[A-Z]{3}$/.test(r.from_currency) &&
      /^[A-Z]{3}$/.test(r.to_currency),
  },
]

function formatAsOf(raw: string | undefined): string {
  if (!raw) return "—"
  const t = new Date(raw)
  if (!Number.isFinite(t.getTime())) return "—"
  return t.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export function OfficeGridRatesPanel() {
  const queryClient = useQueryClient()
  const ratesQuery = useOfficeGridRates()
  const rates = ratesQuery.data ?? []
  const showTableSkeleton = useQueryInitialLoading(ratesQuery.isPending, ratesQuery.data)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncSummary, setSyncSummary] = useState<string | null>(null)

  const refreshGridRatesData = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: officeKeys.gridRates() })
  }, [queryClient])

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
        lastUpdate: lastMs > 0 ? formatAsOf(new Date(lastMs).toISOString()) : "—",
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

  return (
    <PlatformControlTabShell
      title="Grid rates"
      actions={
        <Button type="button" size="sm" onClick={() => void handleSyncRates()} disabled={syncing || showTableSkeleton}>
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
      {!error && ratesQuery.error ? (
        <p className="text-sm text-destructive" role="alert">
          {ratesQuery.error instanceof Error ? ratesQuery.error.message : "Failed to load Grid rates"}
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
                        <span className="text-muted-foreground text-sm">None — run Sync rates</span>
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

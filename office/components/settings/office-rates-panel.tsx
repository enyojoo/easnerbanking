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
import { exchangeRatesApi } from "@/lib/exchange-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeExchangeRates } from "@/hooks/queries"
import { CurrencyFlag } from "@/components/flags"
import { Loader2 } from "lucide-react"

const REPORTING_FX_CURRENCY_CODES = ["USD", "EUR", "GBP", "NGN"] as const

type ExchangeRateRow = {
  from_currency: string
  to_currency: string
  rate: number
  status: string
  updated_at?: string
  as_of?: string
  source?: string
}

const BASE_LABELS: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  NGN: "Nigerian Naira",
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "—"
  if (rate >= 100) return rate.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return rate.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

export function OfficeRatesPanel() {
  const queryClient = useQueryClient()
  const ratesQuery = useOfficeExchangeRates()
  const rates = (ratesQuery.data ?? []) as ExchangeRateRow[]
  const loading = ratesQuery.isPending && rates.length === 0
  const queryError = ratesQuery.error
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshRates = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: officeKeys.exchangeRates() })
  }, [queryClient])

  const handleSyncRates = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      await exchangeRatesApi.syncFromModel()
      await refreshRates()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }, [refreshRates])

  const lastRatesUpdate = useMemo(() => {
    let maxMs = 0
    for (const r of rates) {
      for (const raw of [r.updated_at, r.as_of]) {
        if (!raw) continue
        const t = new Date(raw).getTime()
        if (Number.isFinite(t) && t > maxMs) maxMs = t
      }
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
      title="Reporting FX"
      description={`Reference rates for business dashboard totals when the org base currency is USD, EUR, GBP, or NGN. Last sync: ${lastRatesUpdate}.`}
      actions={
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSyncRates()}
          disabled={syncing || loading}
        >
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
          {queryError instanceof Error ? queryError.message : "Failed to load rates"}
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-6 py-4">
            <p className="text-sm text-muted-foreground">
              Fixed base currencies:{" "}
              {REPORTING_FX_CURRENCY_CODES.map((code) => (
                <span key={code} className="inline-flex items-center gap-1 mr-3 font-medium text-foreground">
                  <CurrencyFlag currency={code} size={14} />
                  {code}
                  <span className="font-normal text-muted-foreground">({BASE_LABELS[code] ?? code})</span>
                </span>
              ))}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : sortedRates.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">
              No reporting FX pairs yet. Click Sync rates to bootstrap and refresh crosses.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRates.map((row) => (
                  <TableRow key={`${row.from_currency}_${row.to_currency}`}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 font-mono">
                        <CurrencyFlag currency={row.from_currency} size={16} />
                        {row.from_currency}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 font-mono">
                        <CurrencyFlag currency={row.to_currency} size={16} />
                        {row.to_currency}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatRate(row.rate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "active" ? "default" : "secondary"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.source ?? "—"}
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

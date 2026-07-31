"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { cryptoDestinationsApi, type CryptoDestinationAdminRow } from "@/lib/crypto-destinations-api"
import { officeKeys } from "@/lib/query/keys"
import { buildCryptoProcessingFeeDraft } from "@/lib/processing-fee-pricing-draft"
import type { ProcessingFeeScheduleRow } from "@/lib/processing-fee-schedule-api"
import { useOfficeCryptoDestinations, useOfficeProcessingFeeSchedule, useQueryInitialLoading } from "@/hooks/queries"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { ProcessingFeePricingDialog } from "@/components/platform-control/processing-fee-pricing-dialog"
import { CryptoAssetIcon } from "@/components/platform-control/crypto-asset-icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"

function groupByAsset(rows: CryptoDestinationAdminRow[]): CryptoDestinationAdminRow[] {
  const map = new Map<string, CryptoDestinationAdminRow>()
  for (const r of rows) {
    const code = r.asset_code.toUpperCase()
    const existing = map.get(code)
    if (!existing) {
      map.set(code, r)
      continue
    }
    const nets = new Set([
      ...(Array.isArray(existing.networks) ? (existing.networks as string[]) : []),
      ...(Array.isArray(r.networks) ? (r.networks as string[]) : []),
    ])
    map.set(code, {
      ...existing,
      networks: [...nets],
      enabled: existing.enabled || r.enabled,
    })
  }
  return [...map.values()].sort((a, b) => a.asset_code.localeCompare(b.asset_code))
}

export function CryptoDestinationsAdminPanel() {
  const queryClient = useQueryClient()
  const destinationsQuery = useOfficeCryptoDestinations()
  const rows = destinationsQuery.data ?? []
  const [error, setError] = useState<string | null>(null)
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const [pricingOpen, setPricingOpen] = useState(false)
  const [pricingInitialRows, setPricingInitialRows] = useState<ProcessingFeeScheduleRow[] | undefined>()
  const cryptoFeesQuery = useOfficeProcessingFeeSchedule("crypto")
  const assetRows = useMemo(() => groupByAsset(rows), [rows])
  const showTableSkeleton = useQueryInitialLoading(destinationsQuery.isPending, destinationsQuery.data, assetRows)
  const refreshing = destinationsQuery.isFetching && !showTableSkeleton

  const openPricing = () => {
    setPricingInitialRows(
      buildCryptoProcessingFeeDraft(
        assetRows.map((row) => ({
          asset_code: row.asset_code,
          asset_name: row.asset_name,
        })),
        cryptoFeesQuery.data,
      ),
    )
    setPricingOpen(true)
  }

  const closePricing = (open: boolean) => {
    setPricingOpen(open)
    if (!open) setPricingInitialRows(undefined)
  }

  const toggleEnabled = async (row: CryptoDestinationAdminRow, enabled: boolean) => {
    const code = row.asset_code.toUpperCase()
    setSavingCode(code)
    try {
      const ids = rows.filter((r) => r.asset_code.toUpperCase() === code).map((r) => r.id)
      const updates = await Promise.all(ids.map((id) => cryptoDestinationsApi.patch(id, { enabled })))
      queryClient.setQueryData<CryptoDestinationAdminRow[]>(officeKeys.cryptoDestinations(), (prev) => {
        const list = prev ?? []
        const byId = new Map(updates.map((u) => [u.id, u]))
        return list.map((r) => byId.get(r.id) ?? r)
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingCode(null)
    }
  }

  return (
    <PlatformControlTabShell
      title="Crypto"
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={openPricing} disabled={assetRows.length === 0}>
            Edit pricing
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void destinationsQuery.refetch()}
            disabled={destinationsQuery.isFetching}
          >
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
        </>
      }
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {destinationsQuery.error ? (
        <p className="text-sm text-destructive">
          {destinationsQuery.error instanceof Error
            ? destinationsQuery.error.message
            : "Failed to load crypto destinations"}
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {showTableSkeleton ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : assetRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No crypto destinations yet. Run <code className="text-xs">scripts/seed-crypto-destinations.ts</code> then{" "}
              <code className="text-xs">scripts/migrate-legacy-currency-catalog.ts</code> to import assets and legacy
              toggles.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Networks</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assetRows.map((r) => (
                  <TableRow key={r.asset_code}>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <CryptoAssetIcon code={r.asset_code} />
                        <span className="truncate font-medium">{r.asset_name}</span>
                        <span className="text-muted-foreground text-xs font-mono shrink-0">({r.asset_code})</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate text-xs font-mono text-muted-foreground">
                      {Array.isArray(r.networks) ? (r.networks as string[]).join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={r.enabled}
                          disabled={savingCode === r.asset_code.toUpperCase()}
                          onCheckedChange={(v) => void toggleEnabled(r, v)}
                        />
                        {savingCode === r.asset_code.toUpperCase() ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProcessingFeePricingDialog
        open={pricingOpen}
        onOpenChange={closePricing}
        scope="crypto"
        title="Crypto processing fees"
        initialRows={pricingInitialRows}
      />
    </PlatformControlTabShell>
  )
}

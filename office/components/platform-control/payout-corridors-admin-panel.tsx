"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { CountryFlag } from "@/components/flags"
import { payoutCorridorsApi, type PayoutCorridorAdminRow } from "@/lib/payout-corridors-api"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { Loader2 } from "lucide-react"

type FiatDestinationRow = {
  key: string
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
  corridorIds: string[]
  enabled: boolean
}

function groupFiatDestinations(rows: PayoutCorridorAdminRow[]): FiatDestinationRow[] {
  const map = new Map<string, FiatDestinationRow>()
  for (const r of rows) {
    const key = `${r.country_code}:${r.currency_code}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        key,
        country_code: r.country_code,
        country_name: r.country_name,
        currency_code: r.currency_code,
        currency_name: r.currency_name,
        corridorIds: [r.id],
        enabled: r.enabled,
      })
      continue
    }
    existing.corridorIds.push(r.id)
    existing.enabled = existing.enabled && r.enabled
  }
  return [...map.values()].sort((a, b) =>
    a.country_name.localeCompare(b.country_name) || a.currency_code.localeCompare(b.currency_code),
  )
}

export function PayoutCorridorsAdminPanel() {
  const [rows, setRows] = useState<PayoutCorridorAdminRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const fiatRows = useMemo(() => groupFiatDestinations(rows), [rows])
  const showTableSkeleton = loading && fiatRows.length === 0

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await payoutCorridorsApi.list()
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load fiat send destinations")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleEnabled = async (row: FiatDestinationRow, enabled: boolean) => {
    setSavingKey(row.key)
    try {
      const updates = await Promise.all(
        row.corridorIds.map((id) => payoutCorridorsApi.patch(id, { enabled })),
      )
      setRows((prev) => {
        const byId = new Map(updates.map((u) => [u.id, u]))
        return prev.map((r) => byId.get(r.id) ?? r)
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
      title="Fiat"
      description="Country and currency pairs users can send to (bank and mobile). Disabled rows are hidden from Business and Mobile send flows."
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading && fiatRows.length > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
      }
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardContent className="p-0">
          {showTableSkeleton ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : fiatRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No fiat destinations yet. Run{" "}
              <code className="text-xs">scripts/seed-payout-corridors.ts</code> then{" "}
              <code className="text-xs">scripts/migrate-legacy-currency-catalog.ts</code> to import corridors and legacy
              currency toggles.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fiatRows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <CountryFlag code={r.country_code} size={20} />
                        <span className="truncate">{r.country_name}</span>
                        <span className="text-muted-foreground text-xs shrink-0">({r.country_code})</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.currency_name}{" "}
                      <span className="text-muted-foreground text-xs">({r.currency_code})</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PlatformControlTabShell>
  )
}

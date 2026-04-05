"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CountryFlag } from "@/components/flags"
import { payoutCorridorsApi, type PayoutCorridorAdminRow } from "@/lib/payout-corridors-api"
import { Loader2 } from "lucide-react"

export function PayoutCorridorsAdminPanel() {
  const [rows, setRows] = useState<PayoutCorridorAdminRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await payoutCorridorsApi.list()
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load corridors")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleEnabled = async (row: PayoutCorridorAdminRow, enabled: boolean) => {
    setSavingId(row.id)
    try {
      const updated = await payoutCorridorsApi.patch(row.id, { enabled })
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingId(null)
    }
  }

  const saveSortOrder = async (row: PayoutCorridorAdminRow, raw: string) => {
    const n = raw.trim() === "" ? null : Number.parseInt(raw, 10)
    if (raw.trim() !== "" && Number.isNaN(n as number)) {
      setError("Sort order must be a number")
      return
    }
    setSavingId(row.id)
    try {
      const updated = await payoutCorridorsApi.patch(row.id, { sort_order: n })
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Payout corridors</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Country-first rails for bank transfer and mobile money. Disabled rows are hidden from business and mobile apps.
            Provider lists are what we offer in the UI; quote and payout APIs still enforce what each settlement partner supports.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
          <CardDescription>
            Toggle availability and adjust sort order (lower first). settlement_backend is optional ops metadata, not a
            guarantee that a provider integration accepts every corridor.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rail</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Providers</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="w-[100px]">Sort</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs capitalize whitespace-nowrap">{r.rail.replace("_", " ")}</TableCell>
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
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground font-mono">
                      {Array.isArray(r.providers) ? (r.providers as string[]).join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={r.enabled}
                          disabled={savingId === r.id}
                          onCheckedChange={(v) => void toggleEnabled(r, v)}
                        />
                        {savingId === r.id ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-xs"
                        defaultValue={r.sort_order ?? ""}
                        disabled={savingId === r.id}
                        onBlur={(e) => {
                          const v = e.target.value
                          if (v === String(r.sort_order ?? "")) return
                          void saveSortOrder(r, v)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur()
                          }
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

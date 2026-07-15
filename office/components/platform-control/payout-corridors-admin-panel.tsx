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

type FiatDestinationRow = {
  key: string
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
  corridorIds: string[]
  enabled: boolean
  payoutProvider: "noah" | "yellowcard"
  payInSupported: boolean
  payInEnabled: boolean
  ycPayInSupported: boolean
  noahPayInSupported: boolean
  supportNoahPayout: boolean
  supportYcPayout: boolean
  payoutLocked: "noah" | "yellowcard" | null
  sample: PayoutCorridorAdminRow
}

function parsePrimaryProvider(routing: unknown): "noah" | "yellowcard" {
  if (!Array.isArray(routing) || routing.length === 0) return "noah"
  const sorted = [...routing].sort(
    (a, b) => Number((a as { priority?: number }).priority ?? 99) - Number((b as { priority?: number }).priority ?? 99),
  )
  const p = String((sorted[0] as { provider?: string })?.provider ?? "noah").toLowerCase()
  return p === "yellowcard" ? "yellowcard" : "noah"
}

function corridorSupportsYcPayIn(meta: Record<string, unknown>): boolean {
  return meta.yc_receive === true
}

function corridorSupportsNoahPayIn(meta: Record<string, unknown>): boolean {
  return meta.noah_receive === true
}

function corridorPayInEnabled(meta: Record<string, unknown>): boolean {
  if (meta.yc_receive === true && meta.yc_receive_enabled === true) return true
  if (meta.noah_receive === true && meta.noah_receive_enabled === true) return true
  return false
}

function groupFiatDestinations(rows: PayoutCorridorAdminRow[]): FiatDestinationRow[] {
  const map = new Map<string, FiatDestinationRow>()
  for (const r of rows) {
    const key = `${r.country_code}:${r.currency_code}`
    const meta = (r.metadata ?? {}) as Record<string, unknown>
    const routing = r.provider_routing
    const primary = parsePrimaryProvider(routing)
    const supportNoahPayout =
      r.provider_health?.noah === "ok" || String(r.settlement_backend ?? "").toLowerCase() === "noah"
    const supportYcPayout = meta.yc_send === true || meta.yellowcard_send === true
    const ycPayInSupported = corridorSupportsYcPayIn(meta)
    const noahPayInSupported = corridorSupportsNoahPayIn(meta)
    const payInSupported = ycPayInSupported || noahPayInSupported
    const payInEnabled = corridorPayInEnabled(meta)
    const payoutLocked: "noah" | "yellowcard" | null =
      supportNoahPayout && !supportYcPayout ? "noah" : !supportNoahPayout && supportYcPayout ? "yellowcard" : null

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
        payoutProvider: primary,
        payInSupported,
        payInEnabled,
        ycPayInSupported,
        noahPayInSupported,
        payoutLocked,
        supportNoahPayout,
        supportYcPayout,
        sample: r,
      })
      continue
    }
    existing.corridorIds.push(r.id)
    existing.enabled = existing.enabled && r.enabled
    existing.supportNoahPayout = existing.supportNoahPayout || supportNoahPayout
    existing.supportYcPayout = existing.supportYcPayout || supportYcPayout
    existing.ycPayInSupported = existing.ycPayInSupported || ycPayInSupported
    existing.noahPayInSupported = existing.noahPayInSupported || noahPayInSupported
    existing.payInSupported = existing.payInSupported || payInSupported
    existing.payInEnabled = existing.payInEnabled || payInEnabled
    if (!existing.payoutLocked && payoutLocked) existing.payoutLocked = payoutLocked
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
  const fiatRows = useMemo(() => groupFiatDestinations(filteredRows), [filteredRows])
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

  const setPayoutProvider = async (row: FiatDestinationRow, provider: "noah" | "yellowcard") => {
    setSavingKey(row.key)
    try {
      const routing = [{ provider, priority: 1, settlement_asset: "USDC" }]
      const updates = await Promise.all(
        row.corridorIds.map((id) => payoutCorridorsApi.patch(id, { provider_routing: routing })),
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
    setSavingKey(row.key)
    try {
      const updates = await Promise.all(
        row.corridorIds.map((id) => {
          const existing = rows.find((r) => r.id === id)
          const meta = { ...((existing?.metadata as object) ?? {}) } as Record<string, unknown>
          const metadata = { ...meta }
          if (meta.yc_receive === true) metadata.yc_receive_enabled = enabled
          if (meta.noah_receive === true) metadata.noah_receive_enabled = enabled
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
        <CardContent className="p-0">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Providers</TableHead>
                  <TableHead>Local pay-in</TableHead>
                  <TableHead>Corridor live</TableHead>
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
                      <div className="flex flex-col gap-1.5">
                        <div className="flex gap-1 flex-wrap">
                          {r.supportNoahPayout ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">Noah</span>
                          ) : null}
                          {r.supportYcPayout ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                              Yellowcard
                            </span>
                          ) : null}
                          {!r.supportNoahPayout && !r.supportYcPayout ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : null}
                        </div>
                        {r.enabled && !r.payoutLocked && r.supportNoahPayout && r.supportYcPayout ? (
                          <select
                            className="h-7 w-fit rounded-md border bg-background px-2 text-[10px]"
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
                            <option value="noah">Payout: Noah</option>
                            <option value="yellowcard">Payout: Yellowcard</option>
                          </select>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {!r.payInSupported ? (
                        <span className="text-xs text-muted-foreground">Not supported</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={r.payInEnabled}
                            disabled={savingKey === r.key}
                            onCheckedChange={(v) => void setLocalPayIn(r, v)}
                          />
                          {!r.enabled && r.payInEnabled ? (
                            <span className="text-xs text-muted-foreground">Off until live</span>
                          ) : null}
                        </div>
                      )}
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

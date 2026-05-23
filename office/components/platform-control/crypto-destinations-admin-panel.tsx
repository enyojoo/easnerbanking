"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { cryptoDestinationsApi, type CryptoDestinationAdminRow } from "@/lib/crypto-destinations-api"
import { getTokenIconUrl } from "@/lib/crypto-icons"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { Loader2 } from "lucide-react"

function CryptoAssetIcon({ code, size = 22 }: { code: string; size?: number }) {
  const upper = code.toUpperCase()
  const src = getTokenIconUrl(upper)
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        loading="lazy"
      />
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {upper.slice(0, 2)}
    </span>
  )
}

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
  const [rows, setRows] = useState<CryptoDestinationAdminRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const assetRows = useMemo(() => groupByAsset(rows), [rows])
  const showTableSkeleton = loading && assetRows.length === 0

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await cryptoDestinationsApi.list()
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load crypto destinations")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleEnabled = async (row: CryptoDestinationAdminRow, enabled: boolean) => {
    const code = row.asset_code.toUpperCase()
    setSavingCode(code)
    try {
      const ids = rows.filter((r) => r.asset_code.toUpperCase() === code).map((r) => r.id)
      const updates = await Promise.all(ids.map((id) => cryptoDestinationsApi.patch(id, { enabled })))
      setRows((prev) => {
        const byId = new Map(updates.map((u) => [u.id, u]))
        return prev.map((r) => byId.get(r.id) ?? r)
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
      description="Stablecoins and on-chain assets users can send to wallet recipients. Disabled assets are hidden from send and recipient flows."
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading && assetRows.length > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
    </PlatformControlTabShell>
  )
}

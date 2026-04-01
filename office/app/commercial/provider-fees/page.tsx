"use client"

import { useEffect, useMemo, useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { commercialApi } from "@/lib/commercial-api"
import type { ProviderFeeSchedule } from "@/lib/types/commercial"

export default function ProviderFeesPage() {
  const [rows, setRows] = useState<ProviderFeeSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [version, setVersion] = useState("")
  const [provider, setProvider] = useState("noah")
  const [rail, setRail] = useState("")
  const [corridor, setCorridor] = useState("")
  const [sourceCurrency, setSourceCurrency] = useState("USD")
  const [destinationCurrency, setDestinationCurrency] = useState("USDC")
  const [variableFeePercent, setVariableFeePercent] = useState("0")
  const [fixedFeeAmount, setFixedFeeAmount] = useState("0")
  const [localRailFeeAmount, setLocalRailFeeAmount] = useState("0")
  const [filterProvider, setFilterProvider] = useState("")
  const [filterVersion, setFilterVersion] = useState("")
  const [filterCorridor, setFilterCorridor] = useState("")
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await commercialApi.listProviderFeeSchedules()
      setRows(data)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to load schedules")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const onCreate = async () => {
    if (!version.trim()) {
      setNotice("version is required")
      return
    }
    try {
      await commercialApi.createProviderFeeSchedule({
        provider,
        version: version.trim(),
        rail: rail || null,
        corridor: corridor || null,
        source_currency: sourceCurrency.toUpperCase(),
        destination_currency: destinationCurrency.toUpperCase(),
        variable_fee_percent: Number(variableFeePercent || 0),
        fixed_fee_amount: Number(fixedFeeAmount || 0),
        local_rail_fee_amount: Number(localRailFeeAmount || 0),
      })
      setNotice("Provider fee schedule saved.")
      await load()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to save schedule")
    }
  }

  const onToggleActive = async (row: ProviderFeeSchedule) => {
    setTogglingId(row.id)
    setNotice(null)
    try {
      await commercialApi.setProviderFeeScheduleActive(row.id, !row.is_active)
      setNotice(`Schedule ${row.version} ${row.is_active ? "deactivated" : "activated"}.`)
      await load()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to update schedule status")
    } finally {
      setTogglingId(null)
    }
  }

  const filteredRows = useMemo(() => {
    const providerNeedle = filterProvider.trim().toLowerCase()
    const versionNeedle = filterVersion.trim().toLowerCase()
    const corridorNeedle = filterCorridor.trim().toLowerCase()
    return rows.filter((r) => {
      if (providerNeedle && !String(r.provider || "").toLowerCase().includes(providerNeedle)) return false
      if (versionNeedle && !String(r.version || "").toLowerCase().includes(versionNeedle)) return false
      if (corridorNeedle && !String(r.corridor || "").toLowerCase().includes(corridorNeedle)) return false
      return true
    })
  }, [rows, filterProvider, filterVersion, filterCorridor])

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Provider Fee Baselines</h1>
        {notice ? <p className="text-sm text-blue-700">{notice}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Add Provider Fee Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Input value={provider} onChange={(e) => setProvider(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Version</Label>
                <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2026-04-v1" />
              </div>
              <div className="space-y-2">
                <Label>Rail</Label>
                <Input value={rail} onChange={(e) => setRail(e.target.value)} placeholder="ACH" />
              </div>
              <div className="space-y-2">
                <Label>Corridor</Label>
                <Input value={corridor} onChange={(e) => setCorridor(e.target.value)} placeholder="US-USD-USDC" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label>Source</Label>
                <Input value={sourceCurrency} onChange={(e) => setSourceCurrency(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-2">
                <Label>Destination</Label>
                <Input value={destinationCurrency} onChange={(e) => setDestinationCurrency(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-2">
                <Label>Variable Fee %</Label>
                <Input value={variableFeePercent} onChange={(e) => setVariableFeePercent(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fixed Fee</Label>
                <Input value={fixedFeeAmount} onChange={(e) => setFixedFeeAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Local Rail Fee</Label>
                <Input value={localRailFeeAmount} onChange={(e) => setLocalRailFeeAmount(e.target.value)} />
              </div>
            </div>
            <Button onClick={onCreate}>Save Fee Baseline</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fee Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="space-y-1">
                <Label>Filter Provider</Label>
                <Input value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)} placeholder="noah" />
              </div>
              <div className="space-y-1">
                <Label>Filter Version</Label>
                <Input value={filterVersion} onChange={(e) => setFilterVersion(e.target.value)} placeholder="2026-04-v1" />
              </div>
              <div className="space-y-1">
                <Label>Filter Corridor</Label>
                <Input value={filterCorridor} onChange={(e) => setFilterCorridor(e.target.value)} placeholder="US-USD-USDC" />
              </div>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading schedules...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Pair</TableHead>
                    <TableHead>Variable %</TableHead>
                    <TableHead>Fixed</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.provider}</TableCell>
                      <TableCell>{r.version}</TableCell>
                      <TableCell>{r.rail || "any"} / {r.corridor || "any"}</TableCell>
                      <TableCell>{r.source_currency || "*"}-{r.destination_currency || "*"}</TableCell>
                      <TableCell>{r.variable_fee_percent}</TableCell>
                      <TableCell>{r.fixed_fee_amount}</TableCell>
                      <TableCell>{r.local_rail_fee_amount}</TableCell>
                      <TableCell>{r.is_active ? "active" : "inactive"}</TableCell>
                      <TableCell>
                        <Button
                          variant={r.is_active ? "outline" : "default"}
                          size="sm"
                          onClick={() => void onToggleActive(r)}
                          disabled={togglingId === r.id}
                        >
                          {togglingId === r.id ? "Updating..." : r.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </OfficeDashboardLayout>
  )
}

"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCommercialRules } from "@/hooks/use-commercial-rules"
import { useCommercialMetrics } from "@/hooks/use-commercial-metrics"
import { commercialApi } from "@/lib/commercial-api"
import type { ProviderFeeSchedule, RolloutControl, PricingEngineHealth } from "@/lib/types/commercial"

export function CommercialRulesPanel() {
  const { rows, loading, error, refresh } = useCommercialRules()
  const [feeKind, setFeeKind] = useState("payout_fee")
  const [sourceCurrency, setSourceCurrency] = useState("USD")
  const [destinationCurrency, setDestinationCurrency] = useState("USD")
  const [flatFee, setFlatFee] = useState("0")
  const [percentFee, setPercentFee] = useState("0")
  const [markupBps, setMarkupBps] = useState("0")
  const [priority, setPriority] = useState("100")
  const [strategyMode, setStrategyMode] = useState("maximize_margin")
  const [minAmount, setMinAmount] = useState("")
  const [maxAmount, setMaxAmount] = useState("")
  const [minimumNetRevenue, setMinimumNetRevenue] = useState("")
  const [minimumMarginBps, setMinimumMarginBps] = useState("")
  const [minimumMarginPercent, setMinimumMarginPercent] = useState("")
  const [allowLossLeader, setAllowLossLeader] = useState(false)
  const [maxTotalFeePercent, setMaxTotalFeePercent] = useState("")
  const [maxTotalFeeAmount, setMaxTotalFeeAmount] = useState("")
  const [smallTicketProtection, setSmallTicketProtection] = useState(true)
  const [routePreference, setRoutePreference] = useState("")
  const [competitivenessTier, setCompetitivenessTier] = useState("")
  const [requiresSubscriptionTier, setRequiresSubscriptionTier] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onCreate = async () => {
    const minAmountNum = minAmount ? Number(minAmount) : null
    const maxAmountNum = maxAmount ? Number(maxAmount) : null
    const percentNum = Number(percentFee || 0)
    const maxTotalFeePercentNum = maxTotalFeePercent ? Number(maxTotalFeePercent) : null
    if (minAmountNum != null && maxAmountNum != null && minAmountNum > maxAmountNum) {
      setNotice("Min amount cannot be greater than max amount.")
      return
    }
    if (!Number.isFinite(percentNum) || percentNum < 0) {
      setNotice("Percent fee must be a valid non-negative number.")
      return
    }
    if (maxTotalFeePercentNum != null && (maxTotalFeePercentNum < 0 || maxTotalFeePercentNum > 1)) {
      setNotice("Max total fee percent must be between 0 and 1.")
      return
    }

    setSubmitting(true)
    setNotice(null)
    try {
      await commercialApi.createRule({
        fee_kind: feeKind,
        source_currency: sourceCurrency || null,
        destination_currency: destinationCurrency || null,
        flat_fee: Number(flatFee || 0),
        percent_fee: Number(percentFee || 0),
        markup_bps: Number(markupBps || 0),
        priority: Number(priority || 100),
        strategy_mode: strategyMode || null,
        min_amount: minAmountNum,
        max_amount: maxAmountNum,
        minimum_net_revenue: minimumNetRevenue ? Number(minimumNetRevenue) : null,
        minimum_margin_bps: minimumMarginBps ? Number(minimumMarginBps) : null,
        minimum_margin_percent: minimumMarginPercent ? Number(minimumMarginPercent) : null,
        allow_loss_leader: allowLossLeader,
        max_total_fee_percent: maxTotalFeePercentNum,
        max_total_fee_amount: maxTotalFeeAmount ? Number(maxTotalFeeAmount) : null,
        is_small_ticket_protection: smallTicketProtection,
        route_preference: routePreference || null,
        competitiveness_tier: competitivenessTier || null,
        requires_subscription_tier: requiresSubscriptionTier || null,
        is_active: true,
      })
      setNotice("Rule created.")
      await refresh()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to create rule")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Pricing rules</h2>
      {notice ? <p className="text-sm text-blue-700">{notice}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Create Rule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Fee Kind</Label>
              <Select value={feeKind} onValueChange={setFeeKind}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fee kind" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payin_fee">payin_fee</SelectItem>
                  <SelectItem value="payout_fee">payout_fee</SelectItem>
                  <SelectItem value="fx_markup">fx_markup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source Currency</Label>
              <Input value={sourceCurrency} onChange={(e) => setSourceCurrency(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2">
              <Label>Destination Currency</Label>
              <Input value={destinationCurrency} onChange={(e) => setDestinationCurrency(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input value={priority} onChange={(e) => setPriority(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Strategy Mode</Label>
              <Select value={strategyMode} onValueChange={setStrategyMode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select strategy mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maximize_margin">maximize_margin</SelectItem>
                  <SelectItem value="maximize_conversion">maximize_conversion</SelectItem>
                  <SelectItem value="maximize_volume">maximize_volume</SelectItem>
                  <SelectItem value="strategic_account_pricing">strategic_account_pricing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Min Amount</Label>
              <Input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Max Amount</Label>
              <Input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="500" />
            </div>
            <div className="space-y-2">
              <Label>Route Preference</Label>
              <Select value={routePreference || "auto"} onValueChange={(v) => setRoutePreference(v === "auto" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Route preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">auto</SelectItem>
                  <SelectItem value="stablecoin_first">stablecoin_first</SelectItem>
                  <SelectItem value="fiat_first">fiat_first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Flat Fee</Label>
              <Input value={flatFee} onChange={(e) => setFlatFee(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Percent Fee (decimal)</Label>
              <Input value={percentFee} onChange={(e) => setPercentFee(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Markup BPS</Label>
              <Input value={markupBps} onChange={(e) => setMarkupBps(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Minimum Net Revenue</Label>
              <Input value={minimumNetRevenue} onChange={(e) => setMinimumNetRevenue(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Minimum Margin (BPS)</Label>
              <Input value={minimumMarginBps} onChange={(e) => setMinimumMarginBps(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Minimum Margin (%)</Label>
              <Input value={minimumMarginPercent} onChange={(e) => setMinimumMarginPercent(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Competitiveness Tier</Label>
              <Select
                value={competitivenessTier || "standard"}
                onValueChange={(v) => setCompetitivenessTier(v === "standard" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Competitiveness tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">standard</SelectItem>
                  <SelectItem value="sensitive">sensitive</SelectItem>
                  <SelectItem value="premium">premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Max Total Fee (%)</Label>
              <Input value={maxTotalFeePercent} onChange={(e) => setMaxTotalFeePercent(e.target.value)} placeholder="0.02" />
            </div>
            <div className="space-y-2">
              <Label>Max Total Fee Amount</Label>
              <Input value={maxTotalFeeAmount} onChange={(e) => setMaxTotalFeeAmount(e.target.value)} placeholder="5" />
            </div>
            <div className="space-y-2">
              <Label>Required Subscription Tier</Label>
              <Select
                value={requiresSubscriptionTier || "none"}
                onValueChange={(v) => setRequiresSubscriptionTier(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Required tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="free">free</SelectItem>
                  <SelectItem value="plus">plus</SelectItem>
                  <SelectItem value="business_standard">business_standard</SelectItem>
                  <SelectItem value="business_pro">business_pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Boolean Flags</Label>
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-3">
                  <Switch checked={allowLossLeader} onCheckedChange={setAllowLossLeader} />
                  <span className="text-sm">allow_loss_leader</span>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={smallTicketProtection} onCheckedChange={setSmallTicketProtection} />
                  <span className="text-sm">is_small_ticket_protection</span>
                </div>
              </div>
            </div>
          </div>
          <Button onClick={onCreate} disabled={submitting}>
            {submitting ? "Creating..." : "Create Rule"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading rules...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead>Flat</TableHead>
                  <TableHead>Percent</TableHead>
                  <TableHead>BPS</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Band</TableHead>
                  <TableHead>Guardrails</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.fee_kind}</TableCell>
                    <TableCell>
                      {rule.source_currency || "*"}-{rule.destination_currency || "*"}
                    </TableCell>
                    <TableCell>{rule.flat_fee ?? 0}</TableCell>
                    <TableCell>{rule.percent_fee ?? 0}</TableCell>
                    <TableCell>{rule.markup_bps ?? 0}</TableCell>
                    <TableCell>{rule.strategy_mode || "default"}</TableCell>
                    <TableCell>
                      {rule.min_amount ?? "*"}-{rule.max_amount ?? "*"}
                    </TableCell>
                    <TableCell>
                      minRev:{rule.minimum_net_revenue ?? "—"} | minBps:{rule.minimum_margin_bps ?? "—"} | cap%:
                      {rule.max_total_fee_percent ?? "—"}
                    </TableCell>
                    <TableCell>{rule.route_preference || "auto"}</TableCell>
                    <TableCell>{rule.priority}</TableCell>
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

export function CommercialProviderFeesPanel() {
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
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Provider fee baselines</h2>
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
                    <TableCell>
                      {r.rail || "any"} / {r.corridor || "any"}
                    </TableCell>
                    <TableCell>
                      {r.source_currency || "*"}-{r.destination_currency || "*"}
                    </TableCell>
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
  )
}

export function CommercialRolloutPanel() {
  const [rows, setRows] = useState<RolloutControl[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [targetType, setTargetType] = useState("country")
  const [targetValue, setTargetValue] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const data = await commercialApi.listRolloutControls()
      setRows(data)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to load rollout controls")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const onCreate = async () => {
    if (!name.trim() || !targetType.trim() || !targetValue.trim()) {
      setNotice("Name, target type, and target value are required.")
      return
    }
    try {
      await commercialApi.createRolloutControl({
        name: name.trim(),
        target_type: targetType.trim(),
        target_value: targetValue.trim(),
      })
      setNotice("Rollout control created.")
      setName("")
      setTargetValue("")
      await load()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to create rollout control")
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Rollout controls</h2>
      {notice ? <p className="text-sm text-blue-700">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Create Rollout Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kenya launch canary" />
            </div>
            <div className="space-y-2">
              <Label>Target Type</Label>
              <Input value={targetType} onChange={(e) => setTargetType(e.target.value)} placeholder="country" />
            </div>
            <div className="space-y-2">
              <Label>Target Value</Label>
              <Input value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="KE" />
            </div>
          </div>
          <Button onClick={onCreate}>Create Rollout Control</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Controls</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading rollout controls...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Target Type</TableHead>
                  <TableHead>Target Value</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((control) => (
                  <TableRow key={control.id}>
                    <TableCell className="font-medium">{control.name}</TableCell>
                    <TableCell>{control.target_type}</TableCell>
                    <TableCell>{control.target_value}</TableCell>
                    <TableCell>{control.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell>{new Date(control.created_at).toLocaleString()}</TableCell>
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

export function CommercialPricingEngineHealthPanel() {
  const [health, setHealth] = useState<PricingEngineHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await commercialApi.getPricingEngineHealth()
      setHealth(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pricing health")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Pricing engine health</h2>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading pricing health...</p>
      ) : health ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Runtime</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>legacyMode: {String(health.runtime.legacyMode)}</p>
              <p>shadowMode: {String(health.runtime.shadowMode)}</p>
              <p>canaryPercent: {health.runtime.canaryPercent}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Rollback Control</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>enabled: {String(health.rollback.enabled)}</p>
              <p>switch: {health.rollback.switch}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Rollout Control</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>shadowMode: {String(health.rollout.shadowMode)}</p>
              <p>canaryPercent: {health.rollout.canaryPercent}%</p>
              <p>switch: {health.rollout.canarySwitch}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

export function CommercialMetricsPanel() {
  const { metrics, loading, error, refresh } = useCommercialMetrics()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Commercial metrics</h2>
        <Button variant="outline" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading metrics...</p>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Gross Revenue ({metrics.window})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.metrics.grossRevenue.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Take Rate (BPS)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.metrics.takeRateBps.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Contribution Margin Proxy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.metrics.contributionMarginProxy.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Failed Transfer Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{(metrics.metrics.failedTransferRate * 100).toFixed(2)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Requote/Expired Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{(metrics.metrics.requoteOrExpiredRate * 100).toFixed(2)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Webhook Failure Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{(metrics.metrics.webhookFailureRate * 100).toFixed(2)}%</div>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Strategy Mode Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.entries(metrics.strategy?.strategyModeCounts || {}).length ? (
                  <ul className="space-y-1 text-sm">
                    {Object.entries(metrics.strategy?.strategyModeCounts || {}).map(([mode, count]) => (
                      <li key={mode}>
                        {mode}: <span className="font-semibold">{count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No strategy data yet.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Repricing Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.entries(metrics.strategy?.repricingReasonCounts || {}).length ? (
                  <ul className="space-y-1 text-sm">
                    {Object.entries(metrics.strategy?.repricingReasonCounts || {}).map(([reason, count]) => (
                      <li key={reason}>
                        {reason}: <span className="font-semibold">{count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No repricing data yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Margin by Amount Band</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.entries(metrics.strategy?.marginByAmountBand || {}).length ? (
                  <ul className="space-y-1 text-sm">
                    {Object.entries(metrics.strategy?.marginByAmountBand || {}).map(([band, data]) => (
                      <li key={band}>
                        {band}: <span className="font-semibold">{data.netRevenue.toFixed(2)}</span> ({data.count})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No amount-band margin data yet.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Margin by Corridor</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.entries(metrics.strategy?.marginByCorridor || {}).length ? (
                  <ul className="space-y-1 text-sm">
                    {Object.entries(metrics.strategy?.marginByCorridor || {})
                      .slice(0, 8)
                      .map(([corridor, data]) => (
                        <li key={corridor}>
                          {corridor}: <span className="font-semibold">{data.netRevenue.toFixed(2)}</span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No corridor margin data yet.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Conversion by Strategy</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.entries(metrics.strategy?.conversionByStrategyMode || {}).length ? (
                  <ul className="space-y-1 text-sm">
                    {Object.entries(metrics.strategy?.conversionByStrategyMode || {}).map(([mode, pct]) => (
                      <li key={mode}>
                        {mode}: <span className="font-semibold">{(pct * 100).toFixed(2)}%</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No strategy conversion data yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Alert Flags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                Webhook retry exhaustion risk:{" "}
                <span className="font-semibold">{String(metrics.alerts?.webhookRetryExhaustionRisk ?? false)}</span>
              </p>
              <p>
                Margin compression risk:{" "}
                <span className="font-semibold">{String(metrics.alerts?.marginCompressionRisk ?? false)}</span>
              </p>
              <p>
                Requote spike risk: <span className="font-semibold">{String(metrics.alerts?.requoteSpikeRisk ?? false)}</span>
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No metrics available.</p>
      )}
    </div>
  )
}

export function HealthAndMetricsTabPanel() {
  return (
    <div className="space-y-10">
      <CommercialPricingEngineHealthPanel />
      <CommercialMetricsPanel />
    </div>
  )
}

export function CommercialWebhookOpsPanel() {
  const [limit, setLimit] = useState("25")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; replayed: number; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onReplay = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await commercialApi.replayFailedWebhooks(Number(limit || 25))
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replay failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Webhook replay operations</h2>
      <Card>
        <CardHeader>
          <CardTitle>Replay Failed Webhooks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>Replay Limit</Label>
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <Button onClick={onReplay} disabled={loading}>
            {loading ? "Replaying..." : "Replay Failed Webhooks"}
          </Button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {result ? (
            <div className="text-sm space-y-1">
              <p>ok: {String(result.ok)}</p>
              <p>replayed: {result.replayed}</p>
              <p>failed: {result.failed}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

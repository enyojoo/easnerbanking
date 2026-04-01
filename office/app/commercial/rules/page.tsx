"use client"

import { useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCommercialRules } from "@/hooks/use-commercial-rules"
import { commercialApi } from "@/lib/commercial-api"

export default function CommercialRulesPage() {
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
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Pricing Rules</h1>
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
    </OfficeDashboardLayout>
  )
}

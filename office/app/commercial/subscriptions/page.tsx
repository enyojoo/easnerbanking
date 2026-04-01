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
import { useCommercialSubscriptions } from "@/hooks/use-commercial-subscriptions"
import { useCommercialPlans } from "@/hooks/use-commercial-plans"
import { commercialApi } from "@/lib/commercial-api"

export default function CommercialSubscriptionsPage() {
  const { rows, loading, error, refresh } = useCommercialSubscriptions()
  const { rows: plans } = useCommercialPlans()
  const [userId, setUserId] = useState("")
  const [organizationId, setOrganizationId] = useState("")
  const [planId, setPlanId] = useState("")
  const [scope, setScope] = useState("individual")
  const [freePayoutsPerPeriod, setFreePayoutsPerPeriod] = useState("0")
  const [fxMarkupDiscountBps, setFxMarkupDiscountBps] = useState("0")
  const [prioritySupport, setPrioritySupport] = useState(false)
  const [rateLockSeconds, setRateLockSeconds] = useState("300")
  const [batchPayoutAccess, setBatchPayoutAccess] = useState(false)
  const [apiAccess, setApiAccess] = useState(false)
  const [approvalWorkflowsEnabled, setApprovalWorkflowsEnabled] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onCreate = async () => {
    if (!userId.trim() || !planId.trim()) {
      setNotice("userId and planId are required.")
      return
    }
    if (Number(rateLockSeconds || 0) < 60) {
      setNotice("Rate lock seconds should be at least 60.")
      return
    }
    setSubmitting(true)
    setNotice(null)
    try {
      await commercialApi.createSubscription({
        userId: userId.trim(),
        organizationId: organizationId.trim() || undefined,
        planId: planId.trim(),
        scope,
        freePayoutsPerPeriod: Number(freePayoutsPerPeriod || 0),
        fxMarkupDiscountBps: Number(fxMarkupDiscountBps || 0),
        prioritySupport,
        rateLockSeconds: Number(rateLockSeconds || 300),
        batchPayoutAccess,
        apiAccess,
        approvalWorkflowsEnabled,
      })
      setNotice("Subscription created.")
      setUserId("")
      setOrganizationId("")
      await refresh()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to create subscription")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Subscriptions</h1>
        {notice ? <p className="text-sm text-blue-700">{notice}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Assign Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>User ID</Label>
                <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="UUID" />
              </div>
              <div className="space-y-2">
                <Label>Organization ID (optional)</Label>
                <Input value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} placeholder="UUID" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan ID</Label>
                <Input value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="UUID" />
                {plans.length ? (
                  <p className="text-xs text-muted-foreground">
                    Available plans: {plans.map((p) => `${p.name} (${p.id.slice(0, 8)}...)`).join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">individual</SelectItem>
                    <SelectItem value="organization">organization</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Free Payouts / Period</Label>
                <Input value={freePayoutsPerPeriod} onChange={(e) => setFreePayoutsPerPeriod(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>FX Markup Discount (BPS)</Label>
                <Input value={fxMarkupDiscountBps} onChange={(e) => setFxMarkupDiscountBps(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Rate Lock (seconds)</Label>
                <Input value={rateLockSeconds} onChange={(e) => setRateLockSeconds(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Entitlement Toggles</Label>
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-3">
                    <Switch checked={prioritySupport} onCheckedChange={setPrioritySupport} />
                    <span className="text-sm">priority_support</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={batchPayoutAccess} onCheckedChange={setBatchPayoutAccess} />
                    <span className="text-sm">batch_payout_access</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={apiAccess} onCheckedChange={setApiAccess} />
                    <span className="text-sm">api_access</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={approvalWorkflowsEnabled} onCheckedChange={setApprovalWorkflowsEnabled} />
                    <span className="text-sm">approval_workflows_enabled</span>
                  </div>
                </div>
              </div>
            </div>
            <Button onClick={onCreate} disabled={submitting}>
              {submitting ? "Assigning..." : "Assign Subscription"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading subscriptions...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Org</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Entitlements</TableHead>
                    <TableHead>Starts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((subscription) => (
                    <TableRow key={subscription.id}>
                      <TableCell className="font-medium">{subscription.user_id}</TableCell>
                      <TableCell>{subscription.organization_id || "—"}</TableCell>
                      <TableCell>{subscription.pricing_plans?.name || subscription.plan_id}</TableCell>
                      <TableCell>{subscription.status}</TableCell>
                      <TableCell>{subscription.scope}</TableCell>
                      <TableCell>
                        free:{subscription.free_payouts_per_period ?? 0} | fxDisc:
                        {subscription.fx_markup_discount_bps ?? 0}bps | rateLock:
                        {subscription.rate_lock_seconds ?? 300}s
                      </TableCell>
                      <TableCell>{new Date(subscription.starts_at).toLocaleString()}</TableCell>
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

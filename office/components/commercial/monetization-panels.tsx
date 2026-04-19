"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCommercialPlans } from "@/hooks/use-commercial-plans"
import { useCommercialSubscriptions } from "@/hooks/use-commercial-subscriptions"
import { useCommercialLimits } from "@/hooks/use-commercial-limits"
import { commercialApi } from "@/lib/commercial-api"
import type { PromoRule } from "@/lib/types/commercial"

export function CommercialPlansPanel() {
  const { rows, loading, error, refresh } = useCommercialPlans()
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [planType, setPlanType] = useState("individual")
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const onCreate = async () => {
    if (!code.trim() || !name.trim()) {
      setNotice("Code and name are required.")
      return
    }
    setSubmitting(true)
    setNotice(null)
    try {
      await commercialApi.createPlan({
        code: code.trim().toLowerCase(),
        name: name.trim(),
        planType,
        isActive,
      })
      setCode("")
      setName("")
      setPlanType("individual")
      setIsActive(true)
      setNotice("Plan created.")
      await refresh()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to create plan")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Plans</h2>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Create Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plan-code">Code</Label>
              <Input id="plan-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="free" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-name">Name</Label>
              <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Free" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-type">Type</Label>
              <Input
                id="plan-type"
                value={planType}
                onChange={(e) => setPlanType(e.target.value)}
                placeholder="individual"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <span className="text-sm">Active</span>
          </div>
          <Button onClick={onCreate} disabled={submitting}>
            {submitting ? "Creating..." : "Create Plan"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading plans...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.code}</TableCell>
                    <TableCell>{plan.name}</TableCell>
                    <TableCell>{plan.plan_type}</TableCell>
                    <TableCell>{plan.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell>{new Date(plan.created_at).toLocaleString()}</TableCell>
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

export function CommercialSubscriptionsPanel() {
  const { rows, loading, error, refresh } = useCommercialSubscriptions()
  const { rows: plans } = useCommercialPlans()
  const [userId, setUserId] = useState("")
  const [businessId, setBusinessId] = useState("")
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
        businessId: businessId.trim() || undefined,
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
      setBusinessId("")
      await refresh()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to create subscription")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Subscriptions</h2>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
              <Label>Business ID (optional)</Label>
              <Input value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder="UUID" />
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
                    <TableCell>{subscription.business_id || "—"}</TableCell>
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
  )
}

export function CommercialPromoPanel() {
  const [rows, setRows] = useState<PromoRule[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [discountType, setDiscountType] = useState("percentage")
  const [discountValue, setDiscountValue] = useState("0")

  const load = async () => {
    setLoading(true)
    try {
      const data = await commercialApi.listPromoRules()
      setRows(data)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to load promo rules")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const onCreate = async () => {
    if (!code.trim() || !name.trim()) {
      setNotice("Code and name are required.")
      return
    }
    try {
      await commercialApi.createPromoRule({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        discount_type: discountType,
        discount_value: Number(discountValue || 0),
      })
      setNotice("Promo rule created.")
      setCode("")
      setName("")
      await load()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to create promo rule")
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Promotions</h2>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Create Promo Rule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="WELCOME10" />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome Offer" />
            </div>
            <div className="space-y-2">
              <Label>Discount Type</Label>
              <Input value={discountType} onChange={(e) => setDiscountType(e.target.value)} placeholder="percentage" />
            </div>
            <div className="space-y-2">
              <Label>Discount Value</Label>
              <Input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            </div>
          </div>
          <Button onClick={onCreate}>Create Promo Rule</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Promo Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading promo rules...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((promo) => (
                  <TableRow key={promo.id}>
                    <TableCell className="font-medium">{promo.code}</TableCell>
                    <TableCell>{promo.name}</TableCell>
                    <TableCell>{promo.discount_type}</TableCell>
                    <TableCell>{promo.discount_value}</TableCell>
                    <TableCell>{promo.used_count}</TableCell>
                    <TableCell>{promo.is_active ? "Yes" : "No"}</TableCell>
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

export function CommercialLimitsPanel() {
  const { rows, loading, error, refresh } = useCommercialLimits()
  const [currency, setCurrency] = useState("USD")
  const [rail, setRail] = useState("wallet")
  const [perTxLimit, setPerTxLimit] = useState("0")
  const [dailyLimit, setDailyLimit] = useState("0")
  const [monthlyLimit, setMonthlyLimit] = useState("0")
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onCreate = async () => {
    setSubmitting(true)
    setNotice(null)
    try {
      await commercialApi.createLimit({
        currency: currency.toUpperCase(),
        rail,
        per_tx_limit: Number(perTxLimit || 0),
        daily_limit: Number(dailyLimit || 0),
        monthly_limit: Number(monthlyLimit || 0),
        is_active: true,
      })
      setNotice("Limit policy created.")
      await refresh()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to create limit policy")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Limit policies</h2>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Create Limit Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2">
              <Label>Rail</Label>
              <Input value={rail} onChange={(e) => setRail(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Per Tx Limit</Label>
              <Input value={perTxLimit} onChange={(e) => setPerTxLimit(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Daily Limit</Label>
              <Input value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Monthly Limit</Label>
              <Input value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} />
            </div>
          </div>
          <Button onClick={onCreate} disabled={submitting}>
            {submitting ? "Creating..." : "Create Limit Policy"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policies</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading limit policies...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rail</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Per Tx</TableHead>
                  <TableHead>Daily</TableHead>
                  <TableHead>Monthly</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell className="font-medium">{policy.rail || "*"}</TableCell>
                    <TableCell>{policy.currency || "*"}</TableCell>
                    <TableCell>{policy.per_tx_limit ?? "—"}</TableCell>
                    <TableCell>{policy.daily_limit ?? "—"}</TableCell>
                    <TableCell>{policy.monthly_limit ?? "—"}</TableCell>
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

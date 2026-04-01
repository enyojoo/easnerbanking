"use client"

import { useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCommercialPlans } from "@/hooks/use-commercial-plans"
import { commercialApi } from "@/lib/commercial-api"

export default function CommercialPlansPage() {
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
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Commercial Plans</h1>
        {notice ? <p className="text-sm text-blue-700">{notice}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

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
    </OfficeDashboardLayout>
  )
}

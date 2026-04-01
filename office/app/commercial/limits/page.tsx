"use client"

import { useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCommercialLimits } from "@/hooks/use-commercial-limits"
import { commercialApi } from "@/lib/commercial-api"

export default function CommercialLimitsPage() {
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
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Limit Policies</h1>
        {notice ? <p className="text-sm text-blue-700">{notice}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

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
    </OfficeDashboardLayout>
  )
}

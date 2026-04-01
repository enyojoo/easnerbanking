"use client"

import { useEffect, useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { commercialApi } from "@/lib/commercial-api"
import type { RolloutControl } from "@/lib/types/commercial"

export default function CommercialRolloutPage() {
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
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Rollout Controls</h1>
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
    </OfficeDashboardLayout>
  )
}

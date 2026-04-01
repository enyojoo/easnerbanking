"use client"

import { useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { commercialApi } from "@/lib/commercial-api"

export default function CommercialOpsPage() {
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
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Webhook Replay Operations</h1>
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
    </OfficeDashboardLayout>
  )
}

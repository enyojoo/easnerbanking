"use client"

import { useEffect, useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { commercialApi } from "@/lib/commercial-api"
import type { PricingEngineHealth } from "@/lib/types/commercial"

export default function CommercialHealthPage() {
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
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Pricing Engine Health</h1>
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
    </OfficeDashboardLayout>
  )
}

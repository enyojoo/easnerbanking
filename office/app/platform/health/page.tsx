"use client"

import { useEffect, useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { officeFetch } from "@/lib/api-client"

export default function PlatformHealthPage() {
  const [health, setHealth] = useState<unknown>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    officeFetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setErr("Could not reach business API /api/health"))
  }, [])

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Integrations & health</h1>
          <p className="text-gray-600 text-sm mt-1">
            Business API status and links to operational tools.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>API health</CardTitle>
            <CardDescription>GET /api/health on the business deployment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {err && <p className="text-sm text-red-600">{err}</p>}
            {health != null && (
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">{JSON.stringify(health, null, 2)}</pre>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhooks & Noah</CardTitle>
            <CardDescription>Use user detail in Compliance to run webhook diagnostics for a Noah customer.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/compliance">Open Compliance</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/platform/noah">Noah operations</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </OfficeDashboardLayout>
  )
}

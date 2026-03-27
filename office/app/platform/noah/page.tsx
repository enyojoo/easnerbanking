"use client"

import { useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { officeFetch } from "@/lib/api-client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function PlatformNoahPage() {
  const [userId, setUserId] = useState("")
  const [scope, setScope] = useState<"individual" | "business">("individual")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runSync = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      const res = await officeFetch("/api/admin/noah/sync-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim(), noahScope: scope }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Request failed")
      setMessage(`Synced (${data.noahScope ?? scope}).`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6 max-w-lg">
        <div>
          <h1 className="text-2xl font-bold">Noah operations</h1>
          <p className="text-gray-600 text-sm mt-1">
            Staff-only sync from Noah into Supabase for a given user id.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sync KYC / customer</CardTitle>
            <CardDescription>Calls Noah GET customer then syncs to `users` (same as mobile flow).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="uid">User ID (UUID)</Label>
              <Input
                id="uid"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Supabase auth user id"
              />
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "individual" | "business")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual (mobile)</SelectItem>
                  <SelectItem value="business">Business (KYB)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runSync} disabled={loading || !userId.trim()}>
              {loading ? "Syncing…" : "Sync from Noah"}
            </Button>
            {message && <p className="text-sm text-green-700">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </OfficeDashboardLayout>
  )
}

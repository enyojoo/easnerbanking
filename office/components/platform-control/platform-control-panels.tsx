"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { officeFetch } from "@/lib/api-client"
import { CurrenciesAdminPanel } from "@/components/currencies/currencies-admin-panel"
import { SettingsAdminPanel } from "@/components/settings/settings-admin-panel"
import { PayoutCorridorsAdminPanel } from "@/components/platform-control/payout-corridors-admin-panel"

export function PlatformCurrenciesPanel() {
  return <CurrenciesAdminPanel />
}

export function PlatformSettingsPanel() {
  return <SettingsAdminPanel />
}

export function PayoutCorridorsPanel() {
  return <PayoutCorridorsAdminPanel />
}

export function IntegrationsHealthPanel() {
  const [health, setHealth] = useState<unknown>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    officeFetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setErr("Could not reach business API /api/health"))
  }, [])

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-2xl font-bold">Integrations and health</h2>
      <p className="text-gray-600 text-sm">Business API status and links to operational tools.</p>

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
          <CardTitle>Webhooks and Noah</CardTitle>
          <CardDescription>Open a user in Users to review verification, then use Noah operations for provider checks.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/users">Users</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/platform-control?tab=noah">Noah operations</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

type AuditEntry = {
  id: string
  admin_user_id: string
  action: string
  resource: string
  metadata: unknown
  created_at: string
}

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    officeFetch("/api/admin/audit-log?limit=200")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setEntries(d.entries ?? [])
      })
      .catch(() => setError("Failed to load audit log (table may not exist yet)"))
  }, [])

  return (
    <div className="space-y-4 max-w-5xl">
      <h2 className="text-2xl font-bold">Audit log</h2>
      <p className="text-sm text-muted-foreground">
        Immutable staff actions (when <code className="text-xs">admin_audit_log</code> is applied in Supabase).
      </p>
      {error && <p className="text-sm text-amber-800">{error}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Recent entries</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs">{new Date(e.created_at).toLocaleString()}</TableCell>
                  <TableCell>{e.action}</TableCell>
                  <TableCell className="font-mono text-xs">{e.resource}</TableCell>
                  <TableCell className="font-mono text-xs">{e.admin_user_id}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export function NoahOperationsPanel() {
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
    <div className="space-y-6 max-w-lg">
      <h2 className="text-2xl font-bold">Noah operations</h2>
      <p className="text-gray-600 text-sm">Staff-only sync from Noah into Supabase for a given user id.</p>

      <Card>
        <CardHeader>
          <CardTitle>Sync KYC / customer</CardTitle>
          <CardDescription>Calls Noah GET customer then syncs to users (same as mobile flow).</CardDescription>
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
  )
}

const industryRows = [
  { area: "Customer / user ops", status: "Partial — users & compliance; notes/history when audit matures" },
  { area: "Payments / money movement", status: "Partial — transactions; exports/search TBD" },
  { area: "Compliance & identity", status: "In progress — KYC & Compliance tabs, Noah ops page" },
  { area: "B2B / commercial", status: "In progress — businesses, customers, invoices (Supabase)" },
  { area: "Treasury / product config", status: "Partial — rates & settings under Platform" },
  { area: "Integrations", status: "Partial — health page; webhook drill-down from Compliance" },
  { area: "Governance", status: "Started — audit log; admin_users.role column" },
  { area: "Reporting", status: "TBD — CSV exports" },
]

export function IndustryChecklistPanel() {
  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-2xl font-bold">Industry checklist</h2>
      <p className="text-gray-600 text-sm">Benchmark against typical fintech back-office expectations. Revisit as you ship.</p>
      <Card>
        <CardHeader>
          <CardTitle>Areas</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            {industryRows.map((r) => (
              <li key={r.area} className="border-b border-border pb-3 last:border-0">
                <p className="font-medium">{r.area}</p>
                <p className="text-muted-foreground">{r.status}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge"
import { usePayrollCapabilities, usePayrollSettings } from "@/hooks/queries/use-payroll"
import { useUpdatePayrollSettings } from "@/hooks/mutations/use-payroll"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import { apiFetch } from "@/lib/query/api-client"

type Assignment = { id: string; user_id: string; role: "viewer" | "preparer" | "approver"; user: { full_name?: string; email?: string; avatar_url?: string | null } | null }

export default function PayrollSettingsPage() {
  const settingsQuery = usePayrollSettings()
  const capabilities = usePayrollCapabilities().data
  const accounts = useBusinessAccountRows().accountRows
  const save = useUpdatePayrollSettings()
  const accessQuery = useQuery({
    queryKey: ["payroll", "access"],
    enabled: Boolean(capabilities?.canApprove),
    queryFn: () => apiFetch<{ assignments: Assignment[] }>("/api/business/payroll/access"),
  })
  const [timezone, setTimezone] = useState("UTC")
  const [accountId, setAccountId] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [paydayTime, setPaydayTime] = useState("09:00")
  const [separate, setSeparate] = useState(false)
  useEffect(() => {
    if (!settingsQuery.data) return
    setTimezone(settingsQuery.data.timezone)
    setAccountId(settingsQuery.data.defaultSourceAccountId || "")
    setCurrency(settingsQuery.data.defaultCurrency)
    setPaydayTime(settingsQuery.data.defaultPaydayTime)
    setSeparate(settingsQuery.data.requireSeparateApprover)
  }, [settingsQuery.data])

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <PayrollPageHeader title="Payroll settings" description="Set business defaults and control who can prepare and approve payroll." />
    <PayrollNavTabs />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="shadow-card"><CardContent className="space-y-7 p-6">
        <section><h2 className="font-semibold">Payroll defaults</h2><p className="mt-1 text-sm text-muted-foreground">These prefill new runs and schedules. They can still be changed before submission.</p><div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Business timezone"><Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Africa/Lagos" /></Field>
          <Field label="Default source account"><Select value={accountId} onValueChange={(id) => { const account = accounts.find((item) => item.id === id); setAccountId(id); if (account) setCurrency(account.currency) }}><SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.currency} account</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Default currency"><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
          <Field label="Default payday time"><Input type="time" value={paydayTime} onChange={(e) => setPaydayTime(e.target.value)} /></Field>
        </div></section>
        <section className="border-t pt-6"><div className="flex items-start justify-between gap-5"><div><h2 className="font-semibold">Require a different approver</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">The person who submits a payroll run cannot approve that same run.</p></div><Switch checked={separate} onCheckedChange={setSeparate} /></div></section>
        <div className="flex justify-end border-t pt-5"><Button variant="primary" disabled={!capabilities?.canApprove || save.isPending} onClick={() => save.mutate({ timezone, defaultSourceAccountId: accountId || null, defaultCurrency: currency, defaultPaydayTime: paydayTime, requireSeparateApprover: separate }, { onSuccess: () => toast.success("Payroll settings saved"), onError: (error) => toast.error(error.message) })}>{save.isPending ? "Saving…" : "Save settings"}</Button></div>
      </CardContent></Card>
      <Card className="h-fit shadow-soft"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Payroll access</h2><p className="mt-1 text-xs text-muted-foreground">Owners and administrators are Approvers by default.</p></div><Button variant="outline" size="sm" asChild><Link href="/settings?tab=team">Manage team</Link></Button></div>
        <div className="mt-5 space-y-3">{(accessQuery.data?.assignments ?? []).map((assignment) => {
          const name = assignment.user?.full_name || assignment.user?.email || "Business member"
          return <div key={assignment.id} className="flex items-center gap-3 rounded-xl border p-3"><Avatar><AvatarImage src={assignment.user?.avatar_url ?? undefined} /><AvatarFallback>{name.slice(0, 1)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p><p className="truncate text-xs text-muted-foreground">{assignment.user?.email || "Active member"}</p></div><PayrollStatusBadge status={assignment.role} /></div>
        })}{capabilities?.canApprove && !accessQuery.isPending && !(accessQuery.data?.assignments.length) ? <p className="text-sm text-muted-foreground">No explicit Payroll roles have been assigned.</p> : null}{!capabilities?.canApprove ? <p className="text-sm text-muted-foreground">Only a Payroll approver can view or change role assignments.</p> : null}</div>
      </CardContent></Card>
    </div>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div> }

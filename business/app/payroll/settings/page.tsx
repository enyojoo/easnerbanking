"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Check, Loader2, Pencil, X } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { PAYROLL_PAYDAY_TIMES, payrollTimezoneOptions } from "@/lib/payroll/options"
import { apiFetch } from "@/lib/query/api-client"
import { formatCurrency } from "@/lib/utils"

type Assignment = { id: string; user_id: string; role: "viewer" | "preparer" | "approver"; user: { full_name?: string; email?: string; avatar_url?: string | null } | null }

export default function PayrollSettingsPage() {
  const settingsQuery = usePayrollSettings()
  const capabilities = usePayrollCapabilities().data
  const accountQuery = useBusinessAccountRows()
  const accounts = accountQuery.accountRows.filter((account) => account.currency === "USD" || account.currency === "EUR")
  const save = useUpdatePayrollSettings()
  const accessQuery = useQuery({
    queryKey: ["payroll", "access"],
    enabled: Boolean(capabilities?.canApprove),
    queryFn: () => apiFetch<{ assignments: Assignment[] }>("/api/business/payroll/access"),
  })
  const [editing, setEditing] = useState(false)
  const [timezone, setTimezone] = useState("UTC")
  const [accountId, setAccountId] = useState("")
  const [paydayTime, setPaydayTime] = useState("09:00")
  const [separate, setSeparate] = useState(false)

  function resetForm() {
    if (!settingsQuery.data) return
    setTimezone(settingsQuery.data.timezone)
    setAccountId(settingsQuery.data.defaultSourceAccountId || "")
    setPaydayTime(settingsQuery.data.defaultPaydayTime)
    setSeparate(settingsQuery.data.requireSeparateApprover)
  }

  useEffect(() => {
    if (editing) return
    resetForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, settingsQuery.data])

  const timezoneOptions = useMemo(() => payrollTimezoneOptions(timezone), [timezone])
  const selectedAccount = accounts.find((account) => account.id === accountId)
  const payrollCurrency = selectedAccount?.currency || settingsQuery.data?.defaultCurrency || "USD"
  const canEdit = Boolean(capabilities?.canApprove)

  function handleSave() {
    save.mutate({
      timezone,
      defaultSourceAccountId: accountId,
      defaultPaydayTime: paydayTime,
      requireSeparateApprover: separate,
    }, {
      onSuccess: () => {
        toast.success("Payroll settings saved")
        setEditing(false)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <PayrollPageHeader title="Payroll settings" description="Set the account, timing, and approval controls used across Payroll." />
    <PayrollNavTabs />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div><CardTitle className="text-base">Payroll defaults</CardTitle><p className="mt-1 text-sm text-muted-foreground">These settings prefill new people, schedules, and payroll runs.</p></div>
            {editing ? <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => { resetForm(); setEditing(false) }}><X className="mr-1 h-4 w-4" />Cancel</Button>
              <Button size="sm" disabled={save.isPending || !accountId || !timezone || !paydayTime} onClick={handleSave}>{save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Save</Button>
            </div> : <Button variant="outline" size="sm" disabled={!canEdit || settingsQuery.isPending} onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" />Edit</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Payroll source account">
              <Select value={accountId} onValueChange={setAccountId} disabled={!editing || accountQuery.loading}>
                <SelectTrigger><SelectValue placeholder={accountQuery.loading ? "Loading accounts…" : "Choose account"} /></SelectTrigger>
                <SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.currency} · {formatCurrency(account.availableBalance ?? account.balance, account.currency)} available</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">All Payroll amounts use this account’s {payrollCurrency} currency.</p>
            </Field>
            <Field label="Business timezone">
              <Select value={timezone} onValueChange={setTimezone} disabled={!editing}>
                <SelectTrigger><SelectValue placeholder="Choose timezone" /></SelectTrigger>
                <SelectContent className="max-h-80">{timezoneOptions.map((value) => <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Default payday time">
              <Select value={paydayTime} onValueChange={setPaydayTime} disabled={!editing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-80">{PAYROLL_PAYDAY_TIMES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <section className="border-t pt-6"><div className="flex items-start justify-between gap-5"><div><h2 className="font-semibold">Require a different approver</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">The person who submits a payroll run cannot approve that same run.</p></div><Switch checked={separate} onCheckedChange={setSeparate} disabled={!editing} /></div></section>
          {!canEdit ? <p className="border-t pt-5 text-sm text-muted-foreground">Only a Payroll approver can change these settings.</p> : null}
        </CardContent>
      </Card>
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

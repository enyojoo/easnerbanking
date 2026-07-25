"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Eye, Mail, MoreHorizontal, Pause, Pencil, Plus, Search, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollDeleteDialog } from "@/components/payroll/payroll-delete-dialog"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollPermissionAction } from "@/components/payroll/payroll-permission-action"
import { PayrollReceivingMethod } from "@/components/payroll/payroll-receiving-method"
import { PayrollCountry } from "@/components/payroll/payroll-country"
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge"
import { usePayrollCapabilities, usePayrollPeople, usePayrollSettings } from "@/hooks/queries/use-payroll"
import { useDeletePayrollPerson, useInvitePayrollPerson, useUpdatePayrollPerson } from "@/hooks/mutations/use-payroll"
import { formatCurrency } from "@/lib/utils"
import type { PayrollPerson } from "@/lib/payroll/types"

type Filter = "all" | "ready" | "awaiting" | "attention" | "inactive"

export default function PayrollPeoplePage() {
  const searchParams = useSearchParams()
  const peopleQuery = usePayrollPeople()
  const capabilitiesQuery = usePayrollCapabilities()
  const payrollCurrency = usePayrollSettings().data?.defaultCurrency
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const updatePerson = useUpdatePayrollPerson()
  const invitePerson = useInvitePayrollPerson()
  const deletePerson = useDeletePayrollPerson()
  const [search, setSearch] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<PayrollPerson | null>(null)
  const initial = searchParams.get("status")
  const [filter, setFilter] = useState<Filter>(
    initial === "awaiting" || initial === "attention" || initial === "inactive" ? initial : "all",
  )
  const all = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data])

  const counts = useMemo(() => ({
    all: all.length,
    ready: all.filter((p) => p.status === "active" && p.readinessStatus === "ready").length,
    awaiting: all.filter((p) => p.connectionStatus === "pending").length,
    attention: all.filter((p) => p.status === "active" && p.readinessStatus !== "ready" && p.connectionStatus !== "pending").length,
    inactive: all.filter((p) => p.status !== "active").length,
  }), [all])
  const people = useMemo(() => all.filter((p) => {
    const q = search.trim().toLowerCase()
    if (q && !`${p.fullName} ${p.email ?? ""} ${p.easetag ?? ""} ${p.internalReference ?? ""}`.toLowerCase().includes(q)) return false
    if (filter === "ready") return p.status === "active" && p.readinessStatus === "ready"
    if (filter === "awaiting") return p.connectionStatus === "pending"
    if (filter === "attention") return p.status === "active" && p.readinessStatus !== "ready" && p.connectionStatus !== "pending"
    if (filter === "inactive") return p.status !== "active"
    return true
  }), [all, filter, search])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PayrollPageHeader
        title="People"
        description="Employees and contractors, their payroll readiness, and how they receive payment."
        actions={<>
          <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button variant="outline" asChild><Link href="/payroll/people/import"><Upload className="mr-2 h-4 w-4" />Import people</Link></Button></PayrollPermissionAction>
          <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button variant="primary" asChild><Link href="/payroll/people/new?returnTo=/payroll/people"><Plus className="mr-2 h-4 w-4" />Add person</Link></Button></PayrollPermissionAction>
        </>}
      />
      <PayrollNavTabs />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="flex gap-1 overflow-x-auto" aria-label="Filter people">
          {([
            ["all", "All"], ["ready", "Ready"], ["awaiting", "Awaiting approval"], ["attention", "Needs attention"], ["inactive", "Inactive"],
          ] as const).map(([value, label]) => (
            <Button key={value} variant={filter === value ? "primary" : "ghost"} size="sm" className="shrink-0" onClick={() => setFilter(value)}>
              {label} <span className="ml-1.5 text-xs opacity-70">{counts[value]}</span>
            </Button>
          ))}
        </div>
      </div>

      {peopleQuery.isPending ? (
        <Card className="overflow-hidden shadow-soft"><CardContent className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full rounded-xl" />)}</CardContent></Card>
      ) : peopleQuery.isError ? (
        <Card><CardContent className="p-8 text-center"><p className="font-medium">People couldn’t be loaded</p><Button className="mt-4" variant="outline" onClick={() => void peopleQuery.refetch()}>Try again</Button></CardContent></Card>
      ) : people.length === 0 ? (
        <Card className="shadow-soft"><CardContent className="p-10 text-center">
          <h2 className="font-semibold">{all.length ? "No people match this view" : "Add the people you pay"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{all.length ? "Try another filter or search." : "Connect with EASETAG or add bank, mobile-money, or stablecoin details manually."}</p>
          {!all.length ? <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><div className="mt-5 flex justify-center gap-2"><Button variant="primary" asChild><Link href="/payroll/people/new?returnTo=/payroll/people">Add person</Link></Button><Button variant="outline" asChild><Link href="/payroll/people/import">Import people</Link></Button></div></PayrollPermissionAction> : null}
        </CardContent></Card>
      ) : (
        <Card className="overflow-hidden shadow-soft">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Person</TableHead><TableHead>Classification</TableHead><TableHead>Receiving method</TableHead><TableHead>Amount</TableHead><TableHead>Country</TableHead><TableHead>Connection</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {people.map((person) => (
                <TableRow key={person.id}>
                  <TableCell><Link href={`/payroll/people/${person.id}`} className="flex items-center gap-3">
                    <Avatar><AvatarImage src={person.avatarUrl ?? undefined} /><AvatarFallback>{person.fullName.slice(0, 1)}</AvatarFallback></Avatar>
                    <span className="min-w-0"><span className="block truncate font-medium">{person.fullName}</span><span className="block truncate text-xs text-muted-foreground">{person.easetag ? `@${person.easetag.replace(/^@/, "")}` : person.email || person.internalReference || "Manual setup"}</span></span>
                  </Link></TableCell>
                  <TableCell className="capitalize">{person.type}</TableCell>
                  <TableCell><PayrollReceivingMethod person={person} typeOnly /></TableCell>
                  <TableCell className="tabular-nums">{formatCurrency(person.defaultAmount, payrollCurrency || person.payCurrency)}</TableCell>
                  <TableCell><PayrollCountry country={person.country} /></TableCell>
                  <TableCell><PayrollStatusBadge status={person.connectionStatus} /></TableCell>
                  <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${person.fullName}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
                    <DropdownMenuItem asChild><Link href={`/payroll/people/${person.id}`}><Eye />View details</Link></DropdownMenuItem>
                    {canPrepare ? <DropdownMenuItem asChild><Link href={`/payroll/people/${person.id}/edit`}><Pencil />Edit person</Link></DropdownMenuItem> : null}
                    {canPrepare && person.rail === "easetag" && person.email && person.connectionStatus !== "approved" ? <DropdownMenuItem onClick={() => invitePerson.mutate(person.id, { onSuccess: () => toast.success("Payroll request sent"), onError: (e) => toast.error(e.message) })}><Mail />{person.connectionStatus === "pending" ? "Resend request" : "Send request"}</DropdownMenuItem> : null}
                    {canPrepare ? <DropdownMenuItem onClick={() => updatePerson.mutate({ id: person.id, patch: { status: person.status === "active" ? "held" : "active" } }, { onSuccess: () => toast.success(person.status === "active" ? "Person put on hold" : "Person reactivated") })}><Pause />{person.status === "active" ? "Put on hold" : "Reactivate"}</DropdownMenuItem> : null}
                    {canPrepare ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(person)}><Trash2 />Delete person</DropdownMenuItem></> : null}
                  </DropdownMenuContent></DropdownMenu></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <PayrollDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete ${deleteTarget.fullName}?` : "Delete person?"}
        description="This permanently removes the person if they have never been included in a payroll run. People with payroll history must be put on hold instead."
        label="Delete person"
        pending={deletePerson.isPending}
        onDelete={async () => {
          if (!deleteTarget) return
          try {
            await deletePerson.mutateAsync(deleteTarget.id)
            toast.success("Person deleted")
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Person could not be deleted")
            throw error
          }
        }}
      />
    </div>
  )
}

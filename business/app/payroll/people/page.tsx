"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Eye, Mail, MoreHorizontal, Pause, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { PayrollDeleteDialog } from "@/components/payroll/payroll-delete-dialog"
import { PayrollListToolbar } from "@/components/payroll/payroll-list-toolbar"
import { PayrollPermissionAction } from "@/components/payroll/payroll-permission-action"
import { PayrollInlineRefreshing } from "@/components/payroll/payroll-page-skeleton"
import { PayrollDetailLink } from "@/components/payroll/payroll-detail-link"
import { PayrollReceivingMethod } from "@/components/payroll/payroll-receiving-method"
import { PayrollCountry } from "@/components/payroll/payroll-country"
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge"
import { usePayrollCapabilities, usePayrollPeople, usePayrollSettings } from "@/hooks/queries/use-payroll"
import { useDeletePayrollPerson, useInvitePayrollPerson, useUpdatePayrollPerson } from "@/hooks/mutations/use-payroll"
import { usePayrollListState } from "@/hooks/use-payroll-list-state"
import { formatCurrency } from "@/lib/utils"
import type { PayrollPerson } from "@/lib/payroll/types"

type Filter = "all" | "ready" | "awaiting" | "attention" | "inactive"
const PEOPLE_FILTERS = ["all", "ready", "awaiting", "attention", "inactive"] as const

export default function PayrollPeoplePage() {
  const peopleQuery = usePayrollPeople()
  const capabilitiesQuery = usePayrollCapabilities()
  const payrollCurrency = usePayrollSettings().data?.defaultCurrency
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const updatePerson = useUpdatePayrollPerson()
  const invitePerson = useInvitePayrollPerson()
  const deletePerson = useDeletePayrollPerson()
  const [deleteTarget, setDeleteTarget] = useState<PayrollPerson | null>(null)
  const [updatingPersonIds, setUpdatingPersonIds] = useState<Set<string>>(() => new Set())
  const { query: search, filter, setQuery: setSearch, setFilter, returnTo } = usePayrollListState<Filter>({
    allowedFilters: PEOPLE_FILTERS,
    defaultFilter: "all",
    filterParam: "view",
    legacyFilterParam: "status",
  })
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

  async function updatePersonAction(person: PayrollPerson, action: "invite" | "toggle") {
    if (updatingPersonIds.has(person.id)) return
    setUpdatingPersonIds((current) => new Set(current).add(person.id))
    try {
      if (action === "invite") {
        await invitePerson.mutateAsync(person.id)
        toast.success("Payroll request sent")
      } else {
        await updatePerson.mutateAsync({
          id: person.id,
          patch: { status: person.status === "active" ? "held" : "active" },
        })
        toast.success(person.status === "active" ? "Person put on hold" : "Person reactivated")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Person could not be updated")
    } finally {
      setUpdatingPersonIds((current) => {
        const next = new Set(current)
        next.delete(person.id)
        return next
      })
    }
  }

  return (
    <>
      <PayrollListToolbar
        query={search}
        onQueryChange={setSearch}
        queryPlaceholder="Search people"
        filter={filter}
        onFilterChange={setFilter}
        label="Filter people"
        filters={[
          { value: "all", label: "All", count: counts.all },
          { value: "ready", label: "Ready", count: counts.ready },
          { value: "awaiting", label: "Awaiting approval", count: counts.awaiting },
          { value: "attention", label: "Needs attention", count: counts.attention },
          { value: "inactive", label: "Inactive", count: counts.inactive },
        ]}
      />

      {peopleQuery.isPending && !peopleQuery.data ? (
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
        <>
        <Card className="hidden overflow-hidden shadow-soft md:block">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Person</TableHead><TableHead>Classification</TableHead><TableHead>Receiving method</TableHead><TableHead>Amount</TableHead><TableHead>Country</TableHead><TableHead>Connection</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {people.map((person) => (
                <TableRow key={person.id}>
                  <TableCell><PayrollDetailLink kind="person" id={person.id} href={`/payroll/people/${person.id}?returnTo=${encodeURIComponent(returnTo)}`} className="flex items-center gap-3">
                    <Avatar><AvatarImage src={person.avatarUrl ?? undefined} /><AvatarFallback>{person.fullName.slice(0, 1)}</AvatarFallback></Avatar>
                    <span className="min-w-0"><span className="block truncate font-medium">{person.fullName}</span><span className="block truncate text-xs text-muted-foreground">{person.easetag ? `@${person.easetag.replace(/^@/, "")}` : person.email || person.internalReference || "Manual setup"}</span></span>
                  </PayrollDetailLink></TableCell>
                  <TableCell className="capitalize">{person.type}</TableCell>
                  <TableCell><PayrollReceivingMethod person={person} typeOnly /></TableCell>
                  <TableCell className="tabular-nums">{formatCurrency(person.defaultAmount, payrollCurrency || person.payCurrency)}</TableCell>
                  <TableCell><PayrollCountry country={person.country} /></TableCell>
                  <TableCell><PayrollStatusBadge status={person.connectionStatus} /></TableCell>
                  <TableCell><PersonActions person={person} returnTo={returnTo} canPrepare={canPrepare} pending={updatingPersonIds.has(person.id)} onInvite={() => void updatePersonAction(person, "invite")} onToggle={() => void updatePersonAction(person, "toggle")} onDelete={() => setDeleteTarget(person)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <div className="space-y-3 md:hidden">
          {people.map((person) => (
            <Card key={person.id} className="shadow-soft">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <PayrollDetailLink kind="person" id={person.id} href={`/payroll/people/${person.id}?returnTo=${encodeURIComponent(returnTo)}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="h-11 w-11"><AvatarImage src={person.avatarUrl ?? undefined} /><AvatarFallback>{person.fullName.slice(0, 1)}</AvatarFallback></Avatar>
                    <span className="min-w-0"><span className="block truncate font-medium">{person.fullName}</span><span className="block truncate text-xs capitalize text-muted-foreground">{person.type}</span></span>
                  </PayrollDetailLink>
                  <PersonActions person={person} returnTo={returnTo} canPrepare={canPrepare} pending={updatingPersonIds.has(person.id)} onInvite={() => void updatePersonAction(person, "invite")} onToggle={() => void updatePersonAction(person, "toggle")} onDelete={() => setDeleteTarget(person)} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Receiving method</dt><dd className="mt-1"><PayrollReceivingMethod person={person} typeOnly /></dd></div>
                  <div><dt className="text-xs text-muted-foreground">Amount</dt><dd className="mt-1 font-medium tabular-nums">{formatCurrency(person.defaultAmount, payrollCurrency || person.payCurrency)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Country</dt><dd className="mt-1"><PayrollCountry country={person.country} /></dd></div>
                  <div><dt className="text-xs text-muted-foreground">Connection</dt><dd className="mt-1"><PayrollStatusBadge status={person.connectionStatus} /></dd></div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
        </>
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
      <PayrollInlineRefreshing visible={peopleQuery.isFetching && !peopleQuery.isPending} />
    </>
  )
}

function PersonActions({
  person,
  returnTo,
  canPrepare,
  pending,
  onInvite,
  onToggle,
  onDelete,
}: {
  person: PayrollPerson
  returnTo: string
  canPrepare: boolean
  pending: boolean
  onInvite: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`Actions for ${person.fullName}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
    <DropdownMenuItem asChild><Link href={`/payroll/people/${person.id}?returnTo=${encodeURIComponent(returnTo)}`}><Eye />View details</Link></DropdownMenuItem>
        {canPrepare ? <DropdownMenuItem asChild><Link href={`/payroll/people/${person.id}/edit`}><Pencil />Edit person</Link></DropdownMenuItem> : null}
        {canPrepare && person.rail === "easetag" && person.email && person.connectionStatus !== "approved" ? <DropdownMenuItem disabled={pending} onClick={onInvite}><Mail />{pending ? "Sending…" : person.connectionStatus === "pending" ? "Resend request" : "Send request"}</DropdownMenuItem> : null}
        {canPrepare ? <DropdownMenuItem disabled={pending} onClick={onToggle}><Pause />{pending ? "Updating…" : person.status === "active" ? "Put on hold" : "Reactivate"}</DropdownMenuItem> : null}
        {canPrepare ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 />Delete person</DropdownMenuItem></> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

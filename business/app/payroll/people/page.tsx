"use client"

import { useMemo, useRef, useState } from "react"
import { Download, Mail, MoreHorizontal, Pause, Plus, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollLegalNote } from "@/components/payroll/payroll-legal-note"
import { PayrollRailBadge } from "@/components/payroll/payroll-rail-badge"
import { PayrollPersonForm } from "@/components/payroll/payroll-person-form"
import { usePayrollCapabilities, usePayrollPeople } from "@/hooks/queries/use-payroll"
import {
  useCreatePayrollPerson,
  useUpdatePayrollPerson,
  useImportPayrollPeople,
  useInvitePayrollPerson,
} from "@/hooks/mutations/use-payroll"
import { formatCurrency } from "@/lib/utils"
import { personNeedsDestination } from "@/lib/payroll/helpers"
import { toast } from "sonner"
import type { PayrollPerson } from "@/lib/payroll/types"

export default function PayrollPeoplePage() {
  const peopleQuery = usePayrollPeople()
  const capabilities = usePayrollCapabilities().data
  const canPrepare = Boolean(capabilities?.enabled && capabilities.canPrepare)
  const createPerson = useCreatePayrollPerson()
  const updatePerson = useUpdatePayrollPerson()
  const importPeople = useImportPayrollPeople()
  const invitePerson = useInvitePayrollPerson()
  const fileRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PayrollPerson | null>(null)
  const [statusFilter, setStatusFilter] = useState<
    "all" | "ready" | "pending" | "declined" | "expired" | "revoked" | "needs_method"
  >("all")

  const people = useMemo(() => {
    const list = peopleQuery.data ?? []
    const q = search.trim().toLowerCase()
    const searched = q ? list.filter(
      (p) => p.fullName.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q),
    ) : list
    if (statusFilter === "all") return searched
    if (statusFilter === "ready") return searched.filter((p) => p.readinessStatus === "ready")
    if (statusFilter === "needs_method") return searched.filter((p) => p.readinessStatus !== "ready")
    return searched.filter((p) => p.connectionStatus === statusFilter)
  }, [peopleQuery.data, search, statusFilter])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="mt-1 text-sm text-muted-foreground">Employees and contractors you pay.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPrepare ? (
            <>
              <Button variant="outline" asChild>
                <a href="/api/business/payroll/people/import" download>
                  <Download className="h-4 w-4 mr-2" />
                  Template
                </a>
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setEditing(null)
                  setDialogOpen(true)
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add person
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <PayrollNavTabs />

      <div className="mb-4">
        <Input
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter payroll people">
        {([
          ["all", "All"],
          ["ready", "Ready"],
          ["pending", "Invitation pending"],
          ["declined", "Declined"],
          ["expired", "Expired"],
          ["revoked", "Revoked"],
          ["needs_method", "Needs attention"],
        ] as const).map(([value, label]) => (
          <Button
            key={value}
            variant={statusFilter === value ? "primary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {people.length === 0 ? (
          <Card className="shadow-soft">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Add your team or import a CSV to get started.
            </CardContent>
          </Card>
        ) : (
          people.map((person) => {
            const needsDest = personNeedsDestination(person)
            return (
              <Card key={person.id} className="shadow-soft">
                <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium truncate">{person.fullName}</p>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {person.type}
                      </span>
                      {person.status === "held" ? (
                        <span className="text-xs text-amber-700">Held</span>
                      ) : null}
                      <span className="text-xs capitalize text-muted-foreground">
                        {person.connectionStatus === "manual"
                          ? "Manual"
                          : `Connection ${person.connectionStatus}`}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{person.email || "No email"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PayrollRailBadge rail={person.rail} />
                      <span className="text-sm tabular-nums">
                        {formatCurrency(person.defaultAmount, person.payCurrency)}
                      </span>
                      {needsDest ? (
                        <span className="text-xs text-amber-700">Needs destination</span>
                      ) : null}
                    </div>
                  </div>
                  {canPrepare ? <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(person)
                          setDialogOpen(true)
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      {person.rail === "easetag" && person.email ? (
                        <DropdownMenuItem
                          onClick={() =>
                            invitePerson.mutate(person.id, {
                              onSuccess: () => toast.success("Invite sent"),
                              onError: (e) => toast.error(e.message),
                            })
                          }
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Invite EASETAG
                        </DropdownMenuItem>
                      ) : null}
                      {person.status === "active" ? (
                        <DropdownMenuItem
                          onClick={() =>
                            updatePerson.mutate(
                              { id: person.id, patch: { status: "held" } },
                              { onSuccess: () => toast.success("Person held") },
                            )
                          }
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Hold from runs
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() =>
                            updatePerson.mutate(
                              { id: person.id, patch: { status: "active" } },
                              { onSuccess: () => toast.success("Person reactivated") },
                            )
                          }
                        >
                          Reactivate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu> : null}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      <PayrollLegalNote className="mt-8" />

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          importPeople.mutate(file, {
            onSuccess: (res) => toast.success(`Imported ${res.imported} people`),
            onError: (err) => toast.error(err.message),
          })
          e.target.value = ""
        }}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit person" : "Add person"}</DialogTitle>
          </DialogHeader>
          <PayrollPersonForm
            initial={editing ?? undefined}
            submitting={createPerson.isPending || updatePerson.isPending}
            onCancel={() => setDialogOpen(false)}
            onSubmit={async (values) => {
              try {
                if (editing) {
                  await updatePerson.mutateAsync({ id: editing.id, patch: values })
                  toast.success("Updated")
                } else {
                  await createPerson.mutateAsync(values)
                  toast.success("Person added")
                }
                setDialogOpen(false)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Save failed")
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

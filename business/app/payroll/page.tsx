"use client"

import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Plus,
  Upload,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollLegalNote } from "@/components/payroll/payroll-legal-note"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollPermissionAction } from "@/components/payroll/payroll-permission-action"
import { PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { usePayrollCapabilities, usePayrollOverview } from "@/hooks/queries/use-payroll"
import { formatCurrency, formatDate } from "@/lib/utils"

export default function PayrollOverviewPage() {
  const overviewQuery = usePayrollOverview()
  const capabilitiesQuery = usePayrollCapabilities()
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const overview = overviewQuery.data
  const empty = !overviewQuery.isPending && (overview?.headcount ?? 0) === 0

  const actions = (
    <>
      <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Add
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link href="/payroll/people/new">Add person</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/payroll/schedules/new">Create schedule</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/payroll/people/import">Import people</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PayrollPermissionAction>
      <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}>
        <Button variant="primary" asChild>
          <Link href="/payroll/runs/new"><Plus className="mr-2 h-4 w-4" />Run payroll</Link>
        </Button>
      </PayrollPermissionAction>
    </>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PayrollPageHeader
        title="Payroll"
        description="Pay employees and contractors, manage approvals, and keep every payment document in one place."
        actions={actions}
      />
      <PayrollNavTabs />

      {capabilitiesQuery.isError ? (
        <Card className="mb-6 border-destructive/30">
          <CardContent className="flex items-center justify-between gap-4 p-4 text-sm">
            <span>We couldn’t check your Payroll permissions.</span>
            <Button variant="outline" size="sm" onClick={() => void capabilitiesQuery.refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : null}

      {overviewQuery.isPending ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : overviewQuery.isError ? (
        <Card><CardContent className="p-8 text-center">
          <p className="font-medium">Payroll couldn’t be loaded</p>
          <p className="mt-1 text-sm text-muted-foreground">Your data is safe. Try loading it again.</p>
          <Button className="mt-4" variant="outline" onClick={() => void overviewQuery.refetch()}>Try again</Button>
        </CardContent></Card>
      ) : empty ? (
        <Card className="overflow-hidden border-primary/15 shadow-card">
          <CardContent className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_.9fr]">
            <div>
              <div className="mb-4 inline-flex rounded-2xl bg-primary/10 p-3 text-primary"><Users className="h-6 w-6" /></div>
              <h2 className="text-xl font-semibold">Set up your payroll</h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Add who you pay, confirm how they receive money, then create your first payroll run.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}>
                  <Button variant="primary" asChild><Link href="/payroll/people/new">Add your first person</Link></Button>
                </PayrollPermissionAction>
                <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}>
                  <Button variant="outline" asChild><Link href="/payroll/people/import"><Upload className="mr-2 h-4 w-4" />Import people</Link></Button>
                </PayrollPermissionAction>
              </div>
            </div>
            <ol className="space-y-4">
              {[
                ["1", "Add an employee or contractor", "Use a verified EASETAG or enter payment details manually."],
                ["2", "Confirm their receiving method", "See who is ready before you include them in a run."],
                ["3", "Create your first payroll run", "Review funding, approve, and track every payment."],
              ].map(([n, title, description]) => (
                <li key={n} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
                  <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={CalendarDays} label="Next payday" value={overview?.nextPayday ? formatDate(overview.nextPayday) : "Not scheduled"} />
            <MetricCard icon={CircleDollarSign} label="Estimated payroll" value={formatCurrency(overview?.estimatedTotal ?? 0, overview?.sourceCurrency ?? "USD")} />
            <MetricCard icon={Users} label="People ready" value={`${Math.max(0, (overview?.activeCount ?? 0) - (overview?.attentionCount ?? 0))} of ${overview?.activeCount ?? 0}`} />
            <MetricCard
              icon={AlertCircle}
              label="Funding readiness"
              value={overview?.funded ? "Ready" : `${formatCurrency(overview?.shortfall ?? 0, overview?.sourceCurrency ?? "USD")} short`}
              tone={overview?.funded ? "positive" : "warning"}
            />
          </div>

          {(overview?.attentionItems ?? []).length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-base font-semibold">Needs attention</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {overview?.attentionItems.map((item) => (
                  <Card key={`${item.code}-${item.actionHref}`} className="shadow-soft">
                    <CardContent className="flex items-start justify-between gap-4 p-4">
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      <Button variant="outline" size="sm" asChild><Link href={item.actionHref}>{item.actionLabel}</Link></Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Recent runs</h2>
              <Button variant="ghost" size="sm" asChild><Link href="/payroll/runs">View all <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
            </div>
            <Card className="overflow-hidden shadow-soft">
              <Table>
                <TableHeader><TableRow><TableHead>Run</TableHead><TableHead>Payday</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(overview?.recentRuns ?? []).map((run) => (
                    <TableRow key={run.id} className="cursor-pointer">
                      <TableCell><Link className="font-medium" href={`/payroll/runs/${run.id}`}>{String(run.metadata?.name || "Payroll run")}</Link></TableCell>
                      <TableCell>{run.payday ? formatDate(run.payday) : "—"}</TableCell>
                      <TableCell className="tabular-nums">{formatCurrency(run.totalSource, run.sourceCurrency)}</TableCell>
                      <TableCell><PayrollRunStatusBadge status={run.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        </>
      )}
      <PayrollLegalNote className="mt-8" />
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string
  tone?: "positive" | "warning"
}) {
  return (
    <Card className="shadow-soft">
      <CardContent className="p-5">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-muted"><Icon className="h-4 w-4" /></div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-semibold ${tone === "positive" ? "text-emerald-700 dark:text-emerald-300" : tone === "warning" ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
